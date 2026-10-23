'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import {
  deleteCriticalSpare, getOwnershipChecklist, recordCompetency, requestOwnershipTransfer, setCompetencyTarget, upsertCriticalSpare, upsertOpsPerson,
  voidCompetencyRecord,
} from '@/app/actions/ops-readiness'
import { COMPETENCY_LEVELS, EVIDENCE_KINDS, SPARE_STATUSES, nextStage, previousStages, type EvidenceKind, type OwnershipStage, type SpareStatus } from '@/lib/startup/catalog'
import { Alert, Chip, Field, MemberSelect, SystemSelect, btn, card, grid, input, linkStyle, small, type Member } from '../../daily/daily-ui'
import StartupTabs from '../StartupTabs'
import { Checklist, LEVEL_COLOR, StageChip, type CheckItem } from './ownership-ui'

type View = 'systems' | 'competency' | 'personnel' | 'spares'
type Sys = { id: string; code: string; name: string; stage: OwnershipStage; since: string | null; required: number }
type Transfer = { id: string; number: string; system_id: string; from_stage: OwnershipStage; to_stage: OwnershipStage; is_reversal: boolean; status: string; requested_at: string; completed_at: string | null }
type Person = { id: string; full_name: string; company: string | null; position: string | null; shift: string | null; user_id: string | null; active: boolean }
type Spare = {
  id: string; system_id: string; kind: 'spare' | 'special_tool'; item: string; part_number: string | null; is_critical: boolean
  qty_required: number; qty_available: number; status: SpareStatus; eta: string | null; notes: string | null
}
type Cell = { level: number; last: number; expired: boolean; expiresAt: string | null }
/** S25 (E-12): historial de una celda (persona × sistema), con las anuladas. */
export type CompetencyRecordRow = { id: string; level: number; assessed_at: string; expires_at: string | null; assessed_by: string | null; voided: boolean; void_reason: string | null }

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const TRANSFER_TONE: Record<string, 'amber' | 'green' | 'struck'> = { pending_signatures: 'amber', completed: 'green', cancelled: 'struck' }
const SPARE_TONE: Record<SpareStatus, 'green' | 'amber' | 'red'> = { available: 'green', ordered: 'amber', not_available: 'red' }

const emptyPerson = { personId: '', fullName: '', company: '', position: '', shift: '', userId: '', active: true }
const emptySpare = { spareId: '', systemId: '', item: '', kind: 'spare' as 'spare' | 'special_tool', partNumber: '', isCritical: true, qtyRequired: '1', qtyAvailable: '0', status: 'not_available' as SpareStatus, eta: '', notes: '' }

export default function OperationsView({ project, initialView, systems, transfers, people, levels, spares, members, canEdit, canAssess, companies = [],
  canRequest, trainerSystems, nonDispensable, history, userId }: {
  project: { id: string; code: string; name: string }
  /** Fase 8: empresas del catálogo (sugeridas; el texto que coincide se enlaza en la BD). */
  companies?: string[]
  initialView: View
  systems: Sys[]
  transfers: Transfer[]
  people: Person[]
  levels: Record<string, Cell>
  spares: Spare[]
  members: Member[]
  canEdit: boolean
  /** Líder o superior: evalúa en cualquier sistema y fija el objetivo por turno. */
  canAssess: boolean
  /** S25 (E-13): pide traspasos un líder o superior. */
  canRequest: boolean
  /** S25 (E-12): sistemas donde el usuario es entrenador (nivel 4 en su ficha vinculada); la BD también lo deja evaluar. */
  trainerSystems: string[]
  /** S25 (E-13): ítems del checklist que la org no deja dispensar. */
  nonDispensable: string[]
  history: Record<string, CompetencyRecordRow[]>
  userId: string
}) {
  const t = useTranslations('Startup')
  // S25b (E-34): diálogo propio en vez de window.confirm.
  const { dialog, ask } = useAskDialog()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [view, setView] = useState<View>(initialView)
  const root = `/projects/${project.id}/startup`
  const sysCode = (id: string) => systems.find(s => s.id === id)?.code ?? '—'
  const pendingOf = (sysId: string) => transfers.find(x => x.system_id === sysId && x.status === 'pending_signatures')

  // Pedir traspaso
  const [req, setReq] = useState<{ systemId: string; toStage: OwnershipStage | ''; reason: string } | null>(null)
  const [check, setCheck] = useState<CheckItem[] | null>(null)
  const [just, setJust] = useState<Record<string, string>>({})
  // Competencia
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null)
  const assessable = (systemId: string) => canAssess || trainerSystems.includes(systemId)
  const [assess, setAssess] = useState<{ personId: string; systemId: string; level: string; evidenceKind: EvidenceKind; evidence: string; assessedAt: string; expiresAt: string } | null>(null)
  // Personal y repuestos
  const [person, setPerson] = useState<typeof emptyPerson | null>(null)
  const [spare, setSpare] = useState<typeof emptySpare | null>(null)
  const [spareFilter, setSpareFilter] = useState('')

  function run<T extends { error?: string }>(fn: () => Promise<T>, after?: (res: T) => void) {
    setError(null); setOk(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.(res)
      router.refresh()
    })
  }

  function openRequest(s: Sys) {
    const to = nextStage(s.stage) ?? ''
    setReq({ systemId: s.id, toStage: to, reason: '' }); setJust({}); setCheck(null); setError(null)
    if (to) loadChecklist(s.id, to)
  }
  function loadChecklist(systemId: string, toStage: OwnershipStage) {
    setCheck(null)
    startTransition(async () => {
      const res = await getOwnershipChecklist({ projectId: project.id, systemId, toStage })
      if (res.error) setError(res.error)
      else setCheck(res.items ?? [])
    })
  }

  const reqSys = req ? systems.find(s => s.id === req.systemId) : undefined
  const isReversal = !!reqSys && !!req?.toStage && previousStages(reqSys.stage).includes(req.toStage)
  const missing = (check ?? []).filter(c => !c.ok)
  const blocking = missing.filter(m => nonDispensable.includes(m.key))
  const reqReady = !!req?.toStage && (isReversal ? req.reason.trim().length >= 10
    : check !== null && blocking.length === 0 && missing.every(m => (just[m.key] ?? '').trim().length >= 10))

  const activePeople = people.filter(p => p.active)
  const tabs: View[] = ['systems', 'competency', 'personnel', 'spares']

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <StartupTabs projectId={project.id} active="operations" subtitle={t('ops.subtitle')} />

      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(k => (
          <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => { setView(k); setError(null); setOk(null) }}
            style={{ ...btn(view === k ? 'primary' : 'outline'), padding: '6px 12px' }}>{t(`ops.view.${k}`)}</button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {ok && <Alert kind="ok">{ok}</Alert>}

      {/* ── Sistemas: etapa, dotación requerida y traspasos ── */}
      {view === 'systems' && (
        <>
          <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>{t('field.system')}</th><th style={th}>{t('ops.col.stage')}</th><th style={th}>{t('ops.col.required')}</th>
                <th style={th}>{t('ops.col.pending')}</th><th style={th}><span className="sr-only">{t('ops.request')}</span></th>
              </tr></thead>
              <tbody>
                {systems.map(s => {
                  const pend = pendingOf(s.id)
                  return (
                    <tr key={s.id}>
                      <td style={td}><strong>{s.code}</strong> <span style={small}>{s.name !== s.code ? s.name : ''}</span></td>
                      <td style={td}><StageChip stage={s.stage} />{s.since && <div style={small}>{t('ops.since')} {s.since.slice(0, 10)}</div>}</td>
                      <td style={td}>
                        {canAssess ? (
                          <input type="number" min={1} max={20} aria-label={t('ops.col.required')} defaultValue={s.required} style={{ ...input, width: 72 }}
                            onBlur={e => { const v = Number(e.target.value); if (v !== s.required && v >= 1 && v <= 20) run(() => setCompetencyTarget({ projectId: project.id, systemId: s.id, required: v })) }} />
                        ) : s.required}
                      </td>
                      <td style={td}>{pend ? <Link href={`${root}/transfers/${pend.id}`} style={linkStyle}>{pend.number} → {t(`ops.stage.${pend.to_stage}`)}</Link> : '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canRequest && !pend && <button type="button" style={btn('outline')} onClick={() => openRequest(s)}>{t('ops.request')}</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {req && reqSys && (
            <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('ops.requestTitle', { system: reqSys.code })}</h2>
              <div style={grid}>
                <Field text={t('ops.col.stage')}><div><StageChip stage={reqSys.stage} /></div></Field>
                <Field text={t('ops.toStage')} required>
                  <select style={input} value={req.toStage} onChange={e => {
                    const v = e.target.value as OwnershipStage
                    setReq({ ...req, toStage: v }); setJust({})
                    if (v && !previousStages(reqSys.stage).includes(v)) loadChecklist(reqSys.id, v); else setCheck([])
                  }}>
                    <option value="">{t('field.pick')}</option>
                    {nextStage(reqSys.stage) && <option value={nextStage(reqSys.stage)!}>{t(`ops.stage.${nextStage(reqSys.stage)!}`)}</option>}
                    {previousStages(reqSys.stage).map(s => <option key={s} value={s}>{t('ops.reversalTo', { stage: t(`ops.stage.${s}`) })}</option>)}
                  </select>
                </Field>
              </div>
              {isReversal ? (
                <Field text={t('ops.reversalReason')} wide required>
                  <textarea rows={2} style={input} value={req.reason} onChange={e => setReq({ ...req, reason: e.target.value })} placeholder={t('ops.min10')} />
                </Field>
              ) : req.toStage && (
                check === null ? <p style={small}>{t('ops.loading')}</p> : (
                  <>
                    {blocking.length > 0 && <Alert kind="error">{t('ops.blockingGaps', { items: blocking.map(b => t(`ops.check.${b.key}`)).join(', ') })}</Alert>}
                    <Checklist items={check} renderException={key => nonDispensable.includes(key) ? (
                      <div style={{ ...small, marginTop: 4, color: 'var(--danger-700)', fontWeight: 600 }}>{t('ops.nonDispensable')}</div>
                    ) : (
                      <textarea rows={2} style={{ ...input, marginTop: 6 }} aria-label={t('ops.justify')} placeholder={t('ops.justifyPlaceholder')}
                        value={just[key] ?? ''} onChange={e => setJust({ ...just, [key]: e.target.value })} />
                    )} />
                    <Field text={t('ops.reasonOptional')} wide><textarea rows={2} style={input} value={req.reason} onChange={e => setReq({ ...req, reason: e.target.value })} /></Field>
                  </>
                )
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn('primary', isPending || !reqReady)} disabled={isPending || !reqReady}
                  onClick={() => run(
                    () => requestOwnershipTransfer({
                      projectId: project.id, systemId: req.systemId, toStage: req.toStage as OwnershipStage, reason: req.reason,
                      exceptions: missing.map(m => ({ key: m.key, justification: just[m.key] ?? '' })),
                    }),
                    res => { if (res.id) router.push(`${root}/transfers/${res.id}`) },
                  )}>{t('ops.submitRequest')}</button>
                <button type="button" style={btn('outline')} onClick={() => setReq(null)}>{t('ops.close')}</button>
              </div>
            </section>
          )}

          <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <h2 style={{ margin: 0, padding: '12px 14px', fontSize: 16 }}>{t('ops.history')}</h2>
            {transfers.length === 0 ? <p style={{ ...small, padding: '0 14px 14px' }}>{t('ops.noTransfers')}</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>N.º</th><th style={th}>{t('field.system')}</th><th style={th}>{t('ops.col.change')}</th>
                  <th style={th}>{t('ops.col.status')}</th><th style={th}>{t('ops.col.date')}</th>
                </tr></thead>
                <tbody>
                  {transfers.map(x => (
                    <tr key={x.id}>
                      <td style={td}><Link href={`${root}/transfers/${x.id}`} style={linkStyle}>{x.number}</Link></td>
                      <td style={td}>{sysCode(x.system_id)}</td>
                      <td style={td}>{t(`ops.stage.${x.from_stage}`)} → {t(`ops.stage.${x.to_stage}`)} {x.is_reversal && <Chip tone="red">{t('ops.reversal')}</Chip>}</td>
                      <td style={td}><Chip tone={TRANSFER_TONE[x.status] ?? 'muted'}>{t(`ops.status.${x.status}`)}</Chip></td>
                      <td style={td}>{(x.completed_at ?? x.requested_at).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* ── Matriz de competencias ── */}
      {view === 'competency' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {COMPETENCY_LEVELS.map(l => (
              <span key={l} style={{ ...small, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span style={{ display: 'inline-block', width: 22, textAlign: 'center', borderRadius: 4, fontWeight: 700, background: LEVEL_COLOR[l].bg, color: LEVEL_COLOR[l].fg }}>{l}</span>
                {t(`ops.level.${l}`)}
              </span>
            ))}
            <span style={small}>· {t('ops.expiredHint')}</span>
          </div>
          {activePeople.length === 0 ? <Alert kind="warn">{t('ops.noPeople')}</Alert> : (
            <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...th, position: 'sticky', left: 0 }}>{t('ops.person')}</th>
                  {systems.map(s => <th key={s.id} style={{ ...th, textAlign: 'center' }} title={s.name}>{s.code}</th>)}
                </tr></thead>
                <tbody>
                  {activePeople.map(p => (
                    <tr key={p.id}>
                      <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--surface, #fff)', whiteSpace: 'nowrap' }}>
                        <strong>{p.full_name}</strong><div style={small}>{[p.position, p.shift && `${t('ops.shift')} ${p.shift}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      {systems.map(s => {
                        const c = levels[`${p.id}:${s.id}`]
                        const shown = c ? (c.expired ? c.last : c.level) : null
                        const col = c && !c.expired ? LEVEL_COLOR[c.level] : LEVEL_COLOR[0]
                        return (
                          <td key={s.id} style={{ ...td, textAlign: 'center', padding: 4 }}>
                            <button type="button" disabled={!assessable(s.id)}
                              title={c?.expired ? t('ops.expiredOn', { date: c.expiresAt ?? '' }) : c?.expiresAt ? t('ops.expiresOn', { date: c.expiresAt }) : undefined}
                              aria-label={`${p.full_name} · ${s.code}: ${shown ?? '—'}`}
                              onClick={() => setAssess({ personId: p.id, systemId: s.id, level: String(c?.level ?? 1), evidenceKind: 'ojt', evidence: '', assessedAt: '', expiresAt: '' })}
                              style={{ width: 36, height: 28, borderRadius: 4, border: '1px solid var(--border)', fontWeight: 700, cursor: assessable(s.id) ? 'pointer' : 'default',
                                background: col.bg, color: col.fg, textDecoration: c?.expired ? 'line-through' : undefined }}>
                              {shown ?? '·'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, ...small, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>{t('ops.atLevel3')}</td>
                    {systems.map(s => (
                      <td key={s.id} style={{ ...td, ...small, textAlign: 'center' }}>{activePeople.filter(p => (levels[`${p.id}:${s.id}`]?.level ?? 0) >= 3).length}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </section>
          )}
          {assess && (
            <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('ops.assessTitle', { person: people.find(p => p.id === assess.personId)?.full_name ?? '', system: sysCode(assess.systemId) })}</h2>
              <div style={grid}>
                <Field text={t('ops.levelLabel')} required>
                  <select style={input} value={assess.level} onChange={e => setAssess({ ...assess, level: e.target.value })}>
                    {COMPETENCY_LEVELS.map(l => <option key={l} value={l}>{l} — {t(`ops.level.${l}`)}</option>)}
                  </select>
                </Field>
                <Field text={t('ops.evidenceKind')}>
                  <select style={input} value={assess.evidenceKind} onChange={e => setAssess({ ...assess, evidenceKind: e.target.value as EvidenceKind })}>
                    {EVIDENCE_KINDS.map(k => <option key={k} value={k}>{t(`ops.evidence.${k}`)}</option>)}
                  </select>
                </Field>
                <Field text={t('ops.assessedAt')}><input type="date" style={input} value={assess.assessedAt} onChange={e => setAssess({ ...assess, assessedAt: e.target.value })} /></Field>
                <Field text={t('ops.expiresAt')}><input type="date" style={input} value={assess.expiresAt} onChange={e => setAssess({ ...assess, expiresAt: e.target.value })} /></Field>
                <Field text={t('ops.evidenceText')} wide><textarea rows={2} style={input} value={assess.evidence} onChange={e => setAssess({ ...assess, evidence: e.target.value })} /></Field>
              </div>
              {(history[`${assess.personId}:${assess.systemId}`] ?? []).length > 0 && (
                <div>
                  <div style={{ ...small, fontWeight: 700, marginBottom: 4 }}>{t('ops.history')}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {history[`${assess.personId}:${assess.systemId}`].map(h => (
                      <li key={h.id} style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', textDecoration: h.voided ? 'line-through' : undefined }}>
                        <span>{t('ops.recordLine', { level: h.level, date: h.assessed_at, by: members.find(m => m.id === h.assessed_by)?.name ?? '—' })}</span>
                        {h.voided && <span style={{ textDecoration: 'none' }}>· {t('ops.voided')}: {h.void_reason}</span>}
                        {!h.voided && (canAssess || h.assessed_by === userId) && voiding?.id !== h.id && (
                          <button type="button" style={{ ...btn('outline'), padding: '2px 8px' }} onClick={() => setVoiding({ id: h.id, reason: '' })}>{t('ops.void')}</button>
                        )}
                        {voiding?.id === h.id && (
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input style={{ ...input, width: 260 }} aria-label={t('ops.voidReason')} placeholder={t('ops.voidReason')} value={voiding.reason}
                              onChange={e => setVoiding({ id: h.id, reason: e.target.value })} />
                            <button type="button" style={btn('primary', isPending || voiding.reason.trim().length < 10)} disabled={isPending || voiding.reason.trim().length < 10}
                              onClick={() => run(() => voidCompetencyRecord({ projectId: project.id, recordId: h.id, reason: voiding.reason }), () => { setVoiding(null); setOk(t('saved')) })}>{t('ops.void')}</button>
                            <button type="button" style={btn('outline')} onClick={() => setVoiding(null)}>{t('ops.close')}</button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn('primary', isPending)} disabled={isPending}
                  onClick={() => run(() => recordCompetency({
                    projectId: project.id, systemId: assess.systemId, personId: assess.personId, level: Number(assess.level), evidenceKind: assess.evidenceKind,
                    evidence: assess.evidence, assessedAt: assess.assessedAt, expiresAt: assess.expiresAt || null,
                  }), () => { setAssess(null); setOk(t('saved')) })}>{t('save')}</button>
                <button type="button" style={btn('outline')} onClick={() => setAssess(null)}>{t('ops.close')}</button>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Personal de operaciones ── */}
      {view === 'personnel' && (
        <>
          {canEdit && !person && <div><button type="button" style={btn('primary')} onClick={() => setPerson({ ...emptyPerson })}>+ {t('ops.addPerson')}</button></div>}
          {person && (
            <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={grid}>
                <Field text={t('ops.fullName')} required><input style={input} value={person.fullName} maxLength={200} onChange={e => setPerson({ ...person, fullName: e.target.value })} /></Field>
                <Field text={t('ops.company')}>
                  <input style={input} list="ops-companies" value={person.company} onChange={e => setPerson({ ...person, company: e.target.value })} />
                  <datalist id="ops-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
                </Field>
                <Field text={t('ops.position')}><input style={input} value={person.position} onChange={e => setPerson({ ...person, position: e.target.value })} /></Field>
                <Field text={t('ops.shift')}><input style={input} value={person.shift} maxLength={30} onChange={e => setPerson({ ...person, shift: e.target.value })} /></Field>
                <Field text={t('ops.user')}><MemberSelect value={person.userId} onChange={v => setPerson({ ...person, userId: v })} members={members} allowEmpty={t('ops.noUser')} /></Field>
                <Field text={t('ops.active')}><label style={small}><input type="checkbox" checked={person.active} onChange={e => setPerson({ ...person, active: e.target.checked })} /> {t('ops.active')}</label></Field>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn('primary', isPending || !person.fullName.trim())} disabled={isPending || !person.fullName.trim()}
                  onClick={() => run(() => upsertOpsPerson({ projectId: project.id, ...person, personId: person.personId || null, userId: person.userId || null }), () => setPerson(null))}>{t('save')}</button>
                <button type="button" style={btn('outline')} onClick={() => setPerson(null)}>{t('ops.close')}</button>
              </div>
            </section>
          )}
          <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
            {people.length === 0 ? <p style={{ ...small, padding: 14 }}>{t('ops.noPeople')}</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>{t('ops.fullName')}</th><th style={th}>{t('ops.company')}</th><th style={th}>{t('ops.position')}</th>
                  <th style={th}>{t('ops.shift')}</th><th style={th}>{t('ops.user')}</th><th style={th}><span className="sr-only">{t('ops.edit')}</span></th>
                </tr></thead>
                <tbody>
                  {people.map(p => (
                    <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                      <td style={td}><strong>{p.full_name}</strong>{!p.active && <> <Chip tone="struck">{t('ops.inactive')}</Chip></>}</td>
                      <td style={td}>{p.company ?? '—'}</td><td style={td}>{p.position ?? '—'}</td><td style={td}>{p.shift ?? '—'}</td>
                      <td style={td}>{p.user_id ? members.find(m => m.id === p.user_id)?.name ?? '—' : '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canEdit && <button type="button" style={btn('outline')} onClick={() => setPerson({
                          personId: p.id, fullName: p.full_name, company: p.company ?? '', position: p.position ?? '', shift: p.shift ?? '', userId: p.user_id ?? '', active: p.active,
                        })}>{t('ops.edit')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* ── Repuestos críticos y herramientas especiales ── */}
      {view === 'spares' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 240 }}><SystemSelect value={spareFilter} onChange={setSpareFilter} systems={systems} emptyLabel={t('field.anySystem')} ariaLabel={t('field.system')} /></div>
            {canEdit && !spare && <button type="button" style={btn('primary')} onClick={() => setSpare({ ...emptySpare, systemId: spareFilter })}>+ {t('ops.addSpare')}</button>}
          </div>
          {spare && (
            <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={grid}>
                <Field text={t('field.system')} required><SystemSelect value={spare.systemId} onChange={v => setSpare({ ...spare, systemId: v })} systems={systems} emptyLabel={t('field.pick')} /></Field>
                <Field text={t('ops.item')} required><input style={input} value={spare.item} maxLength={200} onChange={e => setSpare({ ...spare, item: e.target.value })} /></Field>
                <Field text={t('field.kind')}>
                  <select style={input} value={spare.kind} onChange={e => setSpare({ ...spare, kind: e.target.value as 'spare' | 'special_tool' })}>
                    <option value="spare">{t('ops.spareKind.spare')}</option><option value="special_tool">{t('ops.spareKind.special_tool')}</option>
                  </select>
                </Field>
                <Field text={t('ops.partNumber')}><input style={input} value={spare.partNumber} onChange={e => setSpare({ ...spare, partNumber: e.target.value })} /></Field>
                <Field text={t('ops.qtyRequired')}><input type="number" min={0} step="any" style={input} value={spare.qtyRequired} onChange={e => setSpare({ ...spare, qtyRequired: e.target.value })} /></Field>
                <Field text={t('ops.qtyAvailable')}><input type="number" min={0} step="any" style={input} value={spare.qtyAvailable} onChange={e => setSpare({ ...spare, qtyAvailable: e.target.value })} /></Field>
                <Field text={t('ops.col.status')}>
                  <select style={input} value={spare.status} onChange={e => setSpare({ ...spare, status: e.target.value as SpareStatus })}>
                    {SPARE_STATUSES.map(s => <option key={s} value={s}>{t(`ops.spareStatus.${s}`)}</option>)}
                  </select>
                </Field>
                <Field text={t('ops.eta')}><input type="date" style={input} value={spare.eta} onChange={e => setSpare({ ...spare, eta: e.target.value })} /></Field>
                <Field text={t('ops.critical')}><label style={small}><input type="checkbox" checked={spare.isCritical} onChange={e => setSpare({ ...spare, isCritical: e.target.checked })} /> {t('ops.criticalHint')}</label></Field>
                <Field text={t('ops.notes')} wide><textarea rows={2} style={input} value={spare.notes} onChange={e => setSpare({ ...spare, notes: e.target.value })} /></Field>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn('primary', isPending || !spare.item.trim() || !spare.systemId)} disabled={isPending || !spare.item.trim() || !spare.systemId}
                  onClick={() => run(() => upsertCriticalSpare({
                    projectId: project.id, systemId: spare.systemId, spareId: spare.spareId || null, item: spare.item, kind: spare.kind, partNumber: spare.partNumber,
                    isCritical: spare.isCritical, qtyRequired: Number(spare.qtyRequired), qtyAvailable: Number(spare.qtyAvailable), status: spare.status,
                    eta: spare.eta || null, notes: spare.notes,
                  }), () => setSpare(null))}>{t('save')}</button>
                <button type="button" style={btn('outline')} onClick={() => setSpare(null)}>{t('ops.close')}</button>
              </div>
            </section>
          )}
          <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
            {spares.filter(s => !spareFilter || s.system_id === spareFilter).length === 0 ? <p style={{ ...small, padding: 14 }}>{t('ops.noSpares')}</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>{t('field.system')}</th><th style={th}>{t('ops.item')}</th><th style={th}>{t('ops.partNumber')}</th>
                  <th style={th}>{t('ops.qty')}</th><th style={th}>{t('ops.col.status')}</th><th style={th}>{t('ops.eta')}</th><th style={th}><span className="sr-only">{`${t('ops.edit')} · ${t('ops.delete')}`}</span></th>
                </tr></thead>
                <tbody>
                  {spares.filter(s => !spareFilter || s.system_id === spareFilter).map(s => (
                    <tr key={s.id}>
                      <td style={td}>{sysCode(s.system_id)}</td>
                      <td style={{ ...td, minWidth: 220 }}>
                        <strong>{s.item}</strong> {s.is_critical && <Chip tone="red">{t('ops.critical')}</Chip>}
                        <div style={small}>{t(`ops.spareKind.${s.kind}`)}{s.notes ? ` · ${s.notes}` : ''}</div>
                      </td>
                      <td style={td}>{s.part_number ?? '—'}</td>
                      <td style={td}>{s.qty_available} / {s.qty_required}</td>
                      <td style={td}><Chip tone={SPARE_TONE[s.status]}>{t(`ops.spareStatus.${s.status}`)}</Chip></td>
                      <td style={td}>{s.eta ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canEdit && (
                          <>
                            <button type="button" style={btn('outline')} onClick={() => setSpare({
                              spareId: s.id, systemId: s.system_id, item: s.item, kind: s.kind, partNumber: s.part_number ?? '', isCritical: s.is_critical,
                              qtyRequired: String(s.qty_required), qtyAvailable: String(s.qty_available), status: s.status, eta: s.eta ?? '', notes: s.notes ?? '',
                            })}>{t('ops.edit')}</button>
                            <button type="button" style={btn('outline')} onClick={async () => { if ((await ask({ title: t('ops.delete'), message: t('ops.confirmDelete'), confirmLabel: t('ops.delete'), danger: true })) !== null) run(() => deleteCriticalSpare({ projectId: project.id, spareId: s.id })) }}>{t('ops.delete')}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
