'use client'

// Editor de una matriz C&E: causas en filas, efectos en columnas y cruces en las celdas
// («X» directo, «T5s» con retardo). Al pulsar una celda se elige directo / con retardo / quitar.
// Causas y efectos se dan de alta y se editan en el panel lateral.
// Sesión 2: cada causa se prueba con su ITR (I30C); la columna «Prueba» muestra su estado y cada
// celda el resultado de su efecto en ese ITR (✓ aprobado, ✗ rechazado).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { itrState, type ItrStatus } from '@/lib/states'
import { useAskDialog } from '@/components/ui/AskDialog'
import { deleteCeMatrix, deleteCeRow, saveCeCause, saveCeEffect, setCeLink } from '@/app/actions/ce-matrix'
import GenerateSourceItrsModal, { type GenerationMember, type GenerationTemplate } from '@/components/itr/GenerateSourceItrsModal'
import type { SourceItrInfo } from '@/lib/itr/source-itrs-server'
import {
  CE_ACTIONS, CE_VOTINGS, linkLabel, matrixGaps, nextSeq,
  type CeAction, type CeCause, type CeEffect, type CeLink, type CeVoting,
} from '@/lib/ce/matrix'

type Panel =
  | { kind: 'cause'; row: CeCause | null }
  | { kind: 'effect'; row: CeEffect | null }
  | { kind: 'cell'; cause: CeCause; effect: CeEffect }
  | null

const field = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const
const primary = { padding: '8px 12px', borderRadius: '7px', border: 0, background: 'var(--primary-600)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' } as const
const secondary = { padding: '8px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', cursor: 'pointer' } as const
const danger = { ...secondary, color: 'var(--danger-700)', borderColor: 'var(--danger-200)' } as const
const ITR_STATUSES = ['not_started', 'in_progress', 'completed', 'approved', 'rejected']

export default function CeMatrixEditor({ projectId, projectName, matrix, causes, effects, links, tagNumbers, canEdit, causeItrs = {}, templates = [], members = [] }: {
  projectId: string
  projectName: string
  matrix: { id: string; code: string; title: string; revision: string | null; sourceDocument: string | null; system: string | null }
  causes: CeCause[]
  effects: CeEffect[]
  links: CeLink[]
  tagNumbers: string[]
  canEdit: boolean
  causeItrs?: Record<string, SourceItrInfo>
  templates?: GenerationTemplate[]
  members?: GenerationMember[]
}) {
  const tc = useTranslations('CeMatrix')
  const router = useRouter()
  const { dialog, confirm } = useAskDialog() // G-08: diálogo propio
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const [generate, setGenerate] = useState<Array<{ id: string; label: string; revision?: boolean }> | null>(null)
  const linkedCauseIds = new Set(links.map(l => l.cause_id))
  const missing = causes.filter(c => linkedCauseIds.has(c.id) && !causeItrs[c.id])
  const tested = causes.filter(c => causeItrs[c.id]?.status === 'approved').length

  const linkMap = useMemo(() => new Map(links.map(l => [`${l.cause_id}|${l.effect_id}`, l])), [links])
  const gaps = useMemo(() => matrixGaps(causes, effects, links), [causes, effects, links])
  const loneCauses = new Set(gaps.causesWithoutEffect)
  const loneEffects = new Set(gaps.effectsWithoutCause)

  function run(action: () => Promise<{ error?: string }>, close = true) {
    setError('')
    start(async () => {
      const res = await action()
      if (res.error) { setError(res.error); return }
      if (close) setPanel(null)
      router.refresh()
    })
  }

  // S13 (F-19): una causa o un efecto con ITR de prueba C&E no se borra (la BD lo impide); se avisa antes.
  const testedItrs = Object.keys(causeItrs).length
  const effectItrs = (effectId: string) => links.filter(l => l.effect_id === effectId && causeItrs[l.cause_id]).length

  async function removeMatrix() {
    if (testedItrs > 0) { setError(tc('cannotDeleteMatrix', { n: testedItrs })); return }
    const message = tc('deleteMatrixConfirm', { code: matrix.code, causes: causes.length, effects: effects.length, links: links.length })
    if (!(await confirm({ message, confirmLabel: tc('deleteMatrix'), danger: true }))) return
    setError('')
    start(async () => {
      const res = await deleteCeMatrix({ projectId, id: matrix.id })
      if (res.error) { setError(res.error); return }
      router.push(`/projects/${projectId}/ce-matrices`)
    })
  }

  const cellStyle = (link: CeLink | undefined, active: boolean) => ({
    width: '46px', minWidth: '46px', height: '34px', textAlign: 'center' as const, fontSize: '12px', fontWeight: 700,
    border: '1px solid var(--border)', cursor: canEdit ? 'pointer' : 'default',
    background: active ? 'var(--primary-100)' : link ? (link.link_type === 'delayed' ? 'var(--warning-100)' : 'var(--success-100)') : 'var(--card-bg)',
    color: link?.link_type === 'delayed' ? 'var(--warning-800)' : 'var(--success-800)',
  })

  return (
    <div style={{ padding: '32px' }}>
      {dialog}
      <Link href={`/projects/${projectId}/ce-matrices`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← {projectName} · {tc('back')}</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}><span style={{ fontFamily: 'monospace' }}>{matrix.code}</span> · {matrix.title}</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {[matrix.system, matrix.revision && `Rev. ${matrix.revision}`, matrix.sourceDocument].filter(Boolean).join(' · ') || tc('noSource')}
            {' · '}{tc('summary', { causes: causes.length, effects: effects.length, links: links.length, tested })}
          </p>
        </div>
        {canEdit && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={primary} onClick={() => { setError(''); setPanel({ kind: 'cause', row: null }) }}>{tc('addCause')}</button>
          <button type="button" style={primary} onClick={() => { setError(''); setPanel({ kind: 'effect', row: null }) }}>{tc('addEffect')}</button>
          {missing.length > 0 && <button type="button" style={secondary} onClick={() => setGenerate(missing.map(c => ({ id: c.id, label: c.code })))}>{tc('generateMissing', { n: missing.length })}</button>}
          <button type="button" style={danger} disabled={pending} onClick={removeMatrix}>{tc('deleteMatrix')}</button>
        </div>}
      </div>

      {(gaps.causesWithoutEffect.length > 0 || gaps.effectsWithoutCause.length > 0) && (
        <p style={{ fontSize: '12px', color: 'var(--warning-700)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: '8px', padding: '8px 12px', margin: '0 0 12px' }}>
          {tc('gaps', { causes: gaps.causesWithoutEffect.length, effects: gaps.effectsWithoutCause.length })}
        </p>
      )}
      {error && !panel && <p role="alert" style={{ color: 'var(--danger-700)', fontSize: '12px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', minWidth: 0, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '75vh' }}>
          {causes.length === 0 && effects.length === 0 ? (
            <p style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{tc('empty')}</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--gray-50)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', minWidth: '280px' }}>{tc('corner')}</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--gray-50)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)', minWidth: '150px' }}>{tc('testCol')}</th>
                  {effects.map(e => (
                    <th key={e.id} scope="col" title={`${e.code} — ${e.description}${e.tag_number ? ` (${e.tag_number})` : ''}`} style={{ position: 'sticky', top: 0, zIndex: 2, background: loneEffects.has(e.id) ? 'var(--warning-50)' : 'var(--gray-50)', borderBottom: '1px solid var(--border)', padding: '6px 4px', verticalAlign: 'bottom' }}>
                      <button type="button" disabled={!canEdit} onClick={() => { setError(''); setPanel({ kind: 'effect', row: e }) }} style={{ border: 0, background: 'transparent', cursor: canEdit ? 'pointer' : 'default', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', maxHeight: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>
                        {e.code}{e.tag_number ? ` · ${e.tag_number}` : ''} · {tc(`action.${e.action}`)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{causes.map(c => (
                <tr key={c.id}>
                  <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: loneCauses.has(c.id) ? 'var(--warning-50)' : 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '6px 10px', textAlign: 'left', fontWeight: 400 }}>
                    <button type="button" disabled={!canEdit} onClick={() => { setError(''); setPanel({ kind: 'cause', row: c }) }} style={{ border: 0, background: 'transparent', padding: 0, cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', color: 'var(--text-strong)', fontSize: '12px' }}>
                      <strong style={{ fontFamily: 'monospace' }}>{c.code}</strong> {c.description}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {[c.signal_tag ?? c.tag_number, [c.condition, c.setpoint].filter(Boolean).join(' '), c.voting && tc(`votingOpt.${c.voting}`)].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </button>
                  </th>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <CauseItrCell info={causeItrs[c.id]} projectId={projectId} />
                  </td>
                  {effects.map(e => {
                    const link = linkMap.get(`${c.id}|${e.id}`)
                    const tested = link ? causeItrs[c.id]?.rows[e.id] : undefined
                    const active = panel?.kind === 'cell' && panel.cause.id === c.id && panel.effect.id === e.id
                    return (
                      <td key={e.id} aria-label={`${c.code} × ${e.code}: ${link ? linkLabel(link) : tc('noLink')}${tested === 'pass' ? `, ${tc('testPassed')}` : tested === 'fail' ? `, ${tc('testFailed')}` : ''}`}
                        style={{ ...cellStyle(link, active), ...(tested === 'pass' ? { background: 'var(--solid-success-700)', color: '#fff' } : tested === 'fail' ? { background: 'var(--solid-danger-700)', color: '#fff' } : {}) }}
                        onClick={() => { if (canEdit) { setError(''); setPanel({ kind: 'cell', cause: c, effect: e }) } }}>
                        {linkLabel(link)}{tested === 'pass' ? ' ✓' : tested === 'fail' ? ' ✗' : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {panel && (
          <aside style={{ flex: '0 1 340px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            {panel.kind === 'cell' && <CellPanel key={`${panel.cause.id}|${panel.effect.id}`} cause={panel.cause} effect={panel.effect} link={linkMap.get(`${panel.cause.id}|${panel.effect.id}`)} pending={pending}
              onSave={delay => run(() => setCeLink({ projectId, matrixId: matrix.id, causeId: panel.cause.id, effectId: panel.effect.id, delay }))} onClose={() => setPanel(null)} />}
            {panel.kind === 'cause' && panel.row && canEdit && linkedCauseIds.has(panel.row.id) && (
              <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                <div style={{ marginBottom: '6px' }}><strong>{tc('test')}</strong> <CauseItrCell info={causeItrs[panel.row.id]} projectId={projectId} /></div>
                <button type="button" style={secondary} onClick={() => setGenerate([{ id: panel.row!.id, label: panel.row!.code, revision: !!causeItrs[panel.row!.id] }])}>
                  {causeItrs[panel.row.id] ? tc('generateRevision') : tc('generateTest')}
                </button>
              </div>
            )}
            {panel.kind === 'cause' && <CauseForm key={panel.row?.id ?? `new-${causes.length}`} row={panel.row} seq={nextSeq(causes)} pending={pending}
              onSave={input => run(() => saveCeCause({ projectId, matrixId: matrix.id, ...input }), !!panel.row)}
              onDelete={panel.row ? async () => {
                if (causeItrs[panel.row!.id]) { setError(tc('cannotDeleteCause', { code: panel.row!.code, itr: causeItrs[panel.row!.id].itrNumber })); return }
                if (await confirm({ message: tc('deleteCauseConfirm', { code: panel.row!.code }), confirmLabel: tc('delete'), danger: true })) run(() => deleteCeRow({ projectId, matrixId: matrix.id, kind: 'cause', id: panel.row!.id }))
              } : undefined}
              onClose={() => setPanel(null)} />}
            {panel.kind === 'effect' && <EffectForm key={panel.row?.id ?? `new-${effects.length}`} row={panel.row} seq={nextSeq(effects)} pending={pending}
              onSave={input => run(() => saveCeEffect({ projectId, matrixId: matrix.id, ...input }), !!panel.row)}
              onDelete={panel.row ? async () => {
                const n = effectItrs(panel.row!.id)
                if (n > 0) { setError(tc('cannotDeleteEffect', { code: panel.row!.code, n })); return }
                if (await confirm({ message: tc('deleteEffectConfirm', { code: panel.row!.code }), confirmLabel: tc('delete'), danger: true })) run(() => deleteCeRow({ projectId, matrixId: matrix.id, kind: 'effect', id: panel.row!.id }))
              } : undefined}
              onClose={() => setPanel(null)} />}
            {error && <p role="alert" style={{ color: 'var(--danger-700)', fontSize: '12px', margin: '10px 0 0' }}>{error}</p>}
          </aside>
        )}
      </div>
      {generate && <GenerateSourceItrsModal projectId={projectId} kind="cause" items={generate} templates={templates} members={members} onClose={() => setGenerate(null)} />}
      <datalist id="ce-tags">{tagNumbers.map(t => <option key={t} value={t} />)}</datalist>
    </div>
  )
}

function CellPanel({ cause, effect, link, pending, onSave, onClose }: {
  cause: CeCause; effect: CeEffect; link: CeLink | undefined; pending: boolean
  onSave: (delay: string | null) => void; onClose: () => void
}) {
  const tc = useTranslations('CeMatrix')
  const [delay, setDelay] = useState(link?.delay_s != null ? String(link.delay_s) : '')
  return <>
    <h2 style={{ fontSize: '14px', margin: '0 0 8px', color: 'var(--text-strong)' }}>{tc('link', { cause: cause.code, effect: effect.code })}</h2>
    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{cause.description} → {tc(`action.${effect.action}`).toLowerCase()} {effect.tag_number ?? effect.description}</p>
    <label style={{ fontSize: '12px', display: 'block', marginBottom: '10px' }}>{tc('delay')}
      <input style={field} inputMode="decimal" value={delay} onChange={e => setDelay(e.target.value)} placeholder={tc('direct')} />
    </label>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" style={primary} disabled={pending} onClick={() => onSave(delay)}>{link ? tc('saveLink') : tc('markLink')}</button>
      {link && <button type="button" style={danger} disabled={pending} onClick={() => onSave(null)}>{tc('remove')}</button>}
      <button type="button" style={secondary} onClick={onClose}>{tc('close')}</button>
    </div>
  </>
}

type CauseInput = { id?: string; seq: number; code: string; description: string; tagNumber: string; signalTag: string; condition: string; setpoint: string; voting: CeVoting | null; notes: string }

function CauseForm({ row, seq, pending, onSave, onDelete, onClose }: {
  row: CeCause | null; seq: number; pending: boolean
  onSave: (input: CauseInput) => void; onDelete?: () => void; onClose: () => void
}) {
  const tc = useTranslations('CeMatrix')
  const [f, setF] = useState<CauseInput>({
    id: row?.id, seq: row?.seq ?? seq, code: row?.code ?? '', description: row?.description ?? '', tagNumber: row?.tag_number ?? '',
    signalTag: row?.signal_tag ?? '', condition: row?.condition ?? '', setpoint: row?.setpoint ?? '', voting: row?.voting ?? null, notes: row?.notes ?? '',
  })
  return <form onSubmit={e => { e.preventDefault(); onSave(f) }} style={{ display: 'grid', gap: '10px' }}>
    <h2 style={{ fontSize: '14px', margin: 0, color: 'var(--text-strong)' }}>{row ? tc('cause', { code: row.code }) : tc('newCause')}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>{tc('code')}<input required maxLength={30} style={field} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="C-01" /></label>
      <label style={{ fontSize: '12px' }}>{tc('order')}<input type="number" style={field} value={f.seq} onChange={e => setF({ ...f, seq: Number(e.target.value) })} /></label>
    </div>
    <label style={{ fontSize: '12px' }}>{tc('description')}<input required maxLength={300} style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder={tc('causePlaceholder')} /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>{tc('initiatingTag')}<input list="ce-tags" maxLength={100} style={field} value={f.tagNumber} onChange={e => setF({ ...f, tagNumber: e.target.value })} placeholder="PT-101" /></label>
      <label style={{ fontSize: '12px' }}>{tc('signal')}<input maxLength={100} style={field} value={f.signalTag} onChange={e => setF({ ...f, signalTag: e.target.value })} placeholder="PAHH-101" /></label>
      <label style={{ fontSize: '12px' }}>{tc('condition')}<input maxLength={100} style={field} value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })} placeholder="HH" /></label>
      <label style={{ fontSize: '12px' }}>{tc('setpoint')}<input maxLength={100} style={field} value={f.setpoint} onChange={e => setF({ ...f, setpoint: e.target.value })} placeholder="9,5 barg" /></label>
    </div>
    <label style={{ fontSize: '12px' }}>{tc('voting')}
      <select style={field} value={f.voting ?? ''} onChange={e => setF({ ...f, voting: (e.target.value || null) as CeVoting | null })}>
        <option value="">—</option>{CE_VOTINGS.map(v => <option key={v} value={v}>{tc(`votingOpt.${v}`)}</option>)}
      </select>
    </label>
    <label style={{ fontSize: '12px' }}>{tc('notes')}<textarea maxLength={1000} rows={2} style={field} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <FormButtons row={!!row} pending={pending} onDelete={onDelete} onClose={onClose} />
  </form>
}

type EffectInput = { id?: string; seq: number; code: string; description: string; tagNumber: string; action: CeAction; notes: string }

function EffectForm({ row, seq, pending, onSave, onDelete, onClose }: {
  row: CeEffect | null; seq: number; pending: boolean
  onSave: (input: EffectInput) => void; onDelete?: () => void; onClose: () => void
}) {
  const tc = useTranslations('CeMatrix')
  const [f, setF] = useState<EffectInput>({
    id: row?.id, seq: row?.seq ?? seq, code: row?.code ?? '', description: row?.description ?? '', tagNumber: row?.tag_number ?? '', action: row?.action ?? 'close', notes: row?.notes ?? '',
  })
  return <form onSubmit={e => { e.preventDefault(); onSave(f) }} style={{ display: 'grid', gap: '10px' }}>
    <h2 style={{ fontSize: '14px', margin: 0, color: 'var(--text-strong)' }}>{row ? tc('effect', { code: row.code }) : tc('newEffect')}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>{tc('code')}<input required maxLength={30} style={field} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="E-01" /></label>
      <label style={{ fontSize: '12px' }}>{tc('order')}<input type="number" style={field} value={f.seq} onChange={e => setF({ ...f, seq: Number(e.target.value) })} /></label>
    </div>
    <label style={{ fontSize: '12px' }}>{tc('description')}<input required maxLength={300} style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder={tc('effectPlaceholder')} /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>{tc('finalTag')}<input list="ce-tags" maxLength={100} style={field} value={f.tagNumber} onChange={e => setF({ ...f, tagNumber: e.target.value })} placeholder="SDV-101" /></label>
      <label style={{ fontSize: '12px' }}>{tc('actionLabel')}
        <select style={field} value={f.action} onChange={e => setF({ ...f, action: e.target.value as CeAction })}>
          {CE_ACTIONS.map(a => <option key={a} value={a}>{tc(`action.${a}`)}</option>)}
        </select>
      </label>
    </div>
    <label style={{ fontSize: '12px' }}>{tc('notes')}<textarea maxLength={1000} rows={2} style={field} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <FormButtons row={!!row} pending={pending} onDelete={onDelete} onClose={onClose} />
  </form>
}

function FormButtons({ row, pending, onDelete, onClose }: { row: boolean; pending: boolean; onDelete?: () => void; onClose: () => void }) {
  const tc = useTranslations('CeMatrix')
  return <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
    <button type="submit" style={primary} disabled={pending}>{pending ? tc('saving') : row ? tc('save') : tc('add')}</button>
    {onDelete && <button type="button" style={danger} disabled={pending} onClick={onDelete}>{tc('delete')}</button>}
    <button type="button" style={secondary} onClick={onClose}>{tc('close')}</button>
  </div>
}

/** Estado del ITR de prueba de una causa: número (enlace), estado y aviso si la matriz cambió después. */
function CauseItrCell({ info, projectId }: { info: SourceItrInfo | undefined; projectId: string }) {
  const tc = useTranslations('CeMatrix')
  const ts = useTranslations('States')
  if (!info) return <span style={{ color: 'var(--text-muted)' }}>{tc('noItr')}</span>
  const st = ITR_STATUSES.includes(info.status) ? itrState({ status: info.status as ItrStatus }) : null
  const color = info.status === 'approved' ? 'var(--success-700)' : Object.values(info.rows).includes('fail') ? 'var(--danger-700)' : 'var(--text-strong)'
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <a href={info.tagId ? `/projects/${projectId}/tags/${info.tagId}/itrs/${info.id}` : '#'} style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{info.itrNumber}</a>
      <span style={{ color: 'var(--text-muted)' }}>{st ? ts(`${st.family}.${st.key}`, st.params) : info.status}</span>
      {info.outdated && <span title={tc('outdatedHint')} style={{ color: 'var(--warning-700)', fontWeight: 600 }}>{tc('outdated')}</span>}
    </span>
  )
}
