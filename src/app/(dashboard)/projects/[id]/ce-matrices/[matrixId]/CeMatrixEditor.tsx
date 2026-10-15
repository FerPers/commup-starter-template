'use client'

// Editor de una matriz C&E: causas en filas, efectos en columnas y cruces en las celdas
// («X» directo, «T5s» con retardo). Al pulsar una celda se elige directo / con retardo / quitar.
// Causas y efectos se dan de alta y se editan en el panel lateral.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { deleteCeMatrix, deleteCeRow, saveCeCause, saveCeEffect, setCeLink } from '@/app/actions/ce-matrix'
import {
  CE_ACTIONS, CE_ACTION_LABELS, CE_VOTINGS, CE_VOTING_LABELS, linkLabel, matrixGaps, nextSeq,
  type CeAction, type CeCause, type CeEffect, type CeLink, type CeVoting,
} from '@/lib/ce/matrix'

type Panel =
  | { kind: 'cause'; row: CeCause | null }
  | { kind: 'effect'; row: CeEffect | null }
  | { kind: 'cell'; cause: CeCause; effect: CeEffect }
  | null

const field = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const
const primary = { padding: '8px 12px', borderRadius: '7px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' } as const
const secondary = { padding: '8px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', cursor: 'pointer' } as const
const danger = { ...secondary, color: '#b91c1c', borderColor: '#fecaca' } as const

export default function CeMatrixEditor({ projectId, projectName, matrix, causes, effects, links, tagNumbers, canEdit }: {
  projectId: string
  projectName: string
  matrix: { id: string; code: string; title: string; revision: string | null; sourceDocument: string | null; system: string | null }
  causes: CeCause[]
  effects: CeEffect[]
  links: CeLink[]
  tagNumbers: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

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

  function removeMatrix() {
    if (!window.confirm(`¿Borrar la matriz ${matrix.code} con sus ${causes.length} causas, ${effects.length} efectos y ${links.length} cruces?`)) return
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
    background: active ? '#dbeafe' : link ? (link.link_type === 'delayed' ? '#fef3c7' : '#dcfce7') : 'var(--card-bg)',
    color: link?.link_type === 'delayed' ? '#92400e' : '#166534',
  })

  return (
    <div style={{ padding: '32px' }}>
      <Link href={`/projects/${projectId}/ce-matrices`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← {projectName} · Matrices C&E</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}><span style={{ fontFamily: 'monospace' }}>{matrix.code}</span> · {matrix.title}</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {[matrix.system, matrix.revision && `Rev. ${matrix.revision}`, matrix.sourceDocument].filter(Boolean).join(' · ') || 'Sin sistema ni documento fuente'}
            {' · '}{causes.length} causas · {effects.length} efectos · {links.length} cruces
          </p>
        </div>
        {canEdit && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={primary} onClick={() => { setError(''); setPanel({ kind: 'cause', row: null }) }}>+ Causa</button>
          <button type="button" style={primary} onClick={() => { setError(''); setPanel({ kind: 'effect', row: null }) }}>+ Efecto</button>
          <button type="button" style={danger} disabled={pending} onClick={removeMatrix}>Borrar matriz</button>
        </div>}
      </div>

      {(gaps.causesWithoutEffect.length > 0 || gaps.effectsWithoutCause.length > 0) && (
        <p style={{ fontSize: '12px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', margin: '0 0 12px' }}>
          ⚠ {gaps.causesWithoutEffect.length} causa(s) sin efecto y {gaps.effectsWithoutCause.length} efecto(s) sin causa (marcados en ámbar). Revisa contra el documento fuente.
        </p>
      )}
      {error && !panel && <p role="alert" style={{ color: '#b91c1c', fontSize: '12px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', minWidth: 0, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '75vh' }}>
          {causes.length === 0 && effects.length === 0 ? (
            <p style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Matriz vacía: agrega causas (filas) y efectos (columnas), luego marca los cruces.</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--gray-50)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', minWidth: '280px' }}>Causa \ Efecto</th>
                  {effects.map(e => (
                    <th key={e.id} scope="col" title={`${e.code} — ${e.description}${e.tag_number ? ` (${e.tag_number})` : ''}`} style={{ position: 'sticky', top: 0, zIndex: 2, background: loneEffects.has(e.id) ? '#fffbeb' : 'var(--gray-50)', borderBottom: '1px solid var(--border)', padding: '6px 4px', verticalAlign: 'bottom' }}>
                      <button type="button" disabled={!canEdit} onClick={() => { setError(''); setPanel({ kind: 'effect', row: e }) }} style={{ border: 0, background: 'transparent', cursor: canEdit ? 'pointer' : 'default', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)', maxHeight: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>
                        {e.code}{e.tag_number ? ` · ${e.tag_number}` : ''} · {CE_ACTION_LABELS[e.action]}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{causes.map(c => (
                <tr key={c.id}>
                  <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: loneCauses.has(c.id) ? '#fffbeb' : 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '6px 10px', textAlign: 'left', fontWeight: 400 }}>
                    <button type="button" disabled={!canEdit} onClick={() => { setError(''); setPanel({ kind: 'cause', row: c }) }} style={{ border: 0, background: 'transparent', padding: 0, cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', color: 'var(--text-strong)', fontSize: '12px' }}>
                      <strong style={{ fontFamily: 'monospace' }}>{c.code}</strong> {c.description}
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {[c.signal_tag ?? c.tag_number, [c.condition, c.setpoint].filter(Boolean).join(' '), c.voting && CE_VOTING_LABELS[c.voting]].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </button>
                  </th>
                  {effects.map(e => {
                    const link = linkMap.get(`${c.id}|${e.id}`)
                    const active = panel?.kind === 'cell' && panel.cause.id === c.id && panel.effect.id === e.id
                    return (
                      <td key={e.id} aria-label={`${c.code} × ${e.code}: ${link ? linkLabel(link) : 'sin cruce'}`} style={cellStyle(link, active)}
                        onClick={() => { if (canEdit) { setError(''); setPanel({ kind: 'cell', cause: c, effect: e }) } }}>
                        {linkLabel(link)}
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
            {panel.kind === 'cause' && <CauseForm key={panel.row?.id ?? `new-${causes.length}`} row={panel.row} seq={nextSeq(causes)} pending={pending}
              onSave={input => run(() => saveCeCause({ projectId, matrixId: matrix.id, ...input }), !!panel.row)}
              onDelete={panel.row ? () => { if (window.confirm(`¿Borrar la causa ${panel.row!.code} y sus cruces?`)) run(() => deleteCeRow({ projectId, matrixId: matrix.id, kind: 'cause', id: panel.row!.id })) } : undefined}
              onClose={() => setPanel(null)} />}
            {panel.kind === 'effect' && <EffectForm key={panel.row?.id ?? `new-${effects.length}`} row={panel.row} seq={nextSeq(effects)} pending={pending}
              onSave={input => run(() => saveCeEffect({ projectId, matrixId: matrix.id, ...input }), !!panel.row)}
              onDelete={panel.row ? () => { if (window.confirm(`¿Borrar el efecto ${panel.row!.code} y sus cruces?`)) run(() => deleteCeRow({ projectId, matrixId: matrix.id, kind: 'effect', id: panel.row!.id })) } : undefined}
              onClose={() => setPanel(null)} />}
            {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '12px', margin: '10px 0 0' }}>{error}</p>}
          </aside>
        )}
      </div>
      <datalist id="ce-tags">{tagNumbers.map(t => <option key={t} value={t} />)}</datalist>
    </div>
  )
}

function CellPanel({ cause, effect, link, pending, onSave, onClose }: {
  cause: CeCause; effect: CeEffect; link: CeLink | undefined; pending: boolean
  onSave: (delay: string | null) => void; onClose: () => void
}) {
  const [delay, setDelay] = useState(link?.delay_s != null ? String(link.delay_s) : '')
  return <>
    <h2 style={{ fontSize: '14px', margin: '0 0 8px', color: 'var(--text-strong)' }}>Cruce {cause.code} × {effect.code}</h2>
    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{cause.description} → {CE_ACTION_LABELS[effect.action].toLowerCase()} {effect.tag_number ?? effect.description}</p>
    <label style={{ fontSize: '12px', display: 'block', marginBottom: '10px' }}>Retardo (s) — vacío = directo
      <input style={field} inputMode="decimal" value={delay} onChange={e => setDelay(e.target.value)} placeholder="Directo" />
    </label>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" style={primary} disabled={pending} onClick={() => onSave(delay)}>{link ? 'Guardar cruce' : 'Marcar cruce'}</button>
      {link && <button type="button" style={danger} disabled={pending} onClick={() => onSave(null)}>Quitar</button>}
      <button type="button" style={secondary} onClick={onClose}>Cerrar</button>
    </div>
  </>
}

type CauseInput = { id?: string; seq: number; code: string; description: string; tagNumber: string; signalTag: string; condition: string; setpoint: string; voting: CeVoting | null; notes: string }

function CauseForm({ row, seq, pending, onSave, onDelete, onClose }: {
  row: CeCause | null; seq: number; pending: boolean
  onSave: (input: CauseInput) => void; onDelete?: () => void; onClose: () => void
}) {
  const [f, setF] = useState<CauseInput>({
    id: row?.id, seq: row?.seq ?? seq, code: row?.code ?? '', description: row?.description ?? '', tagNumber: row?.tag_number ?? '',
    signalTag: row?.signal_tag ?? '', condition: row?.condition ?? '', setpoint: row?.setpoint ?? '', voting: row?.voting ?? null, notes: row?.notes ?? '',
  })
  return <form onSubmit={e => { e.preventDefault(); onSave(f) }} style={{ display: 'grid', gap: '10px' }}>
    <h2 style={{ fontSize: '14px', margin: 0, color: 'var(--text-strong)' }}>{row ? `Causa ${row.code}` : 'Nueva causa'}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>Código *<input required maxLength={30} style={field} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="C-01" /></label>
      <label style={{ fontSize: '12px' }}>Orden<input type="number" style={field} value={f.seq} onChange={e => setF({ ...f, seq: Number(e.target.value) })} /></label>
    </div>
    <label style={{ fontSize: '12px' }}>Descripción *<input required maxLength={300} style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Muy alta presión en separador" /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>Tag iniciador<input list="ce-tags" maxLength={100} style={field} value={f.tagNumber} onChange={e => setF({ ...f, tagNumber: e.target.value })} placeholder="PT-101" /></label>
      <label style={{ fontSize: '12px' }}>Señal<input maxLength={100} style={field} value={f.signalTag} onChange={e => setF({ ...f, signalTag: e.target.value })} placeholder="PAHH-101" /></label>
      <label style={{ fontSize: '12px' }}>Condición<input maxLength={100} style={field} value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })} placeholder="HH" /></label>
      <label style={{ fontSize: '12px' }}>Set point<input maxLength={100} style={field} value={f.setpoint} onChange={e => setF({ ...f, setpoint: e.target.value })} placeholder="9,5 barg" /></label>
    </div>
    <label style={{ fontSize: '12px' }}>Votación
      <select style={field} value={f.voting ?? ''} onChange={e => setF({ ...f, voting: (e.target.value || null) as CeVoting | null })}>
        <option value="">—</option>{CE_VOTINGS.map(v => <option key={v} value={v}>{CE_VOTING_LABELS[v]}</option>)}
      </select>
    </label>
    <label style={{ fontSize: '12px' }}>Notas<textarea maxLength={1000} rows={2} style={field} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <FormButtons row={!!row} pending={pending} onDelete={onDelete} onClose={onClose} />
  </form>
}

type EffectInput = { id?: string; seq: number; code: string; description: string; tagNumber: string; action: CeAction; notes: string }

function EffectForm({ row, seq, pending, onSave, onDelete, onClose }: {
  row: CeEffect | null; seq: number; pending: boolean
  onSave: (input: EffectInput) => void; onDelete?: () => void; onClose: () => void
}) {
  const [f, setF] = useState<EffectInput>({
    id: row?.id, seq: row?.seq ?? seq, code: row?.code ?? '', description: row?.description ?? '', tagNumber: row?.tag_number ?? '', action: row?.action ?? 'close', notes: row?.notes ?? '',
  })
  return <form onSubmit={e => { e.preventDefault(); onSave(f) }} style={{ display: 'grid', gap: '10px' }}>
    <h2 style={{ fontSize: '14px', margin: 0, color: 'var(--text-strong)' }}>{row ? `Efecto ${row.code}` : 'Nuevo efecto'}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>Código *<input required maxLength={30} style={field} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="E-01" /></label>
      <label style={{ fontSize: '12px' }}>Orden<input type="number" style={field} value={f.seq} onChange={e => setF({ ...f, seq: Number(e.target.value) })} /></label>
    </div>
    <label style={{ fontSize: '12px' }}>Descripción *<input required maxLength={300} style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Cierre de válvula de entrada" /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <label style={{ fontSize: '12px' }}>Tag final<input list="ce-tags" maxLength={100} style={field} value={f.tagNumber} onChange={e => setF({ ...f, tagNumber: e.target.value })} placeholder="SDV-101" /></label>
      <label style={{ fontSize: '12px' }}>Acción
        <select style={field} value={f.action} onChange={e => setF({ ...f, action: e.target.value as CeAction })}>
          {CE_ACTIONS.map(a => <option key={a} value={a}>{CE_ACTION_LABELS[a]}</option>)}
        </select>
      </label>
    </div>
    <label style={{ fontSize: '12px' }}>Notas<textarea maxLength={1000} rows={2} style={field} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <FormButtons row={!!row} pending={pending} onDelete={onDelete} onClose={onClose} />
  </form>
}

function FormButtons({ row, pending, onDelete, onClose }: { row: boolean; pending: boolean; onDelete?: () => void; onClose: () => void }) {
  return <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
    <button type="submit" style={primary} disabled={pending}>{pending ? 'Guardando…' : row ? 'Guardar' : 'Agregar'}</button>
    {onDelete && <button type="button" style={danger} disabled={pending} onClick={onDelete}>Borrar</button>}
    <button type="button" style={secondary} onClick={onClose}>Cerrar</button>
  </div>
}
