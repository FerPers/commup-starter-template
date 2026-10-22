'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import {
  deleteProcedureDraft, fieldVerifyProcedure, newProcedureRevision, saveProcedureRevision, startProcedureRun,
  transitionProcedureRevision, updateProcedure,
} from '@/app/actions/startup'
import {
  HOLD_CAPACITIES, PROCEDURE_KINDS, PROCEDURE_SECTIONS, emptyStep,
  type HoldCapacity, type ProcedureKind, type ProcedureSection, type StepDraft,
} from '@/lib/startup/catalog'
import { TagPicker } from '../../../registers/RegisterFields'
import { Alert, Chip, Field, SystemSelect, btn, card, grid, input, label, linkStyle, small } from '../../../daily/daily-ui'
import { useLocalTime } from '@/lib/use-local-time'
import { ROLE_TIERS } from '@/lib/constants/roles'

type Revision = {
  id: string; rev: number; status: string; sections: Record<string, string>; changeReason: string | null; returnedReason: string | null
  createdBy: string | null; submittedBy: string | null; approvedBy: string | null; approvedAt: string | null
  /** S14 (E-30): quienes editaron el borrador (no lo aprueban). */
  editors: string[]
  fieldVerifiedBy: string | null; fieldVerifiedAt: string | null; walkdownNote: string | null; hash: string | null
}
const REV_TONE: Record<string, 'muted' | 'blue' | 'green' | 'struck'> = { draft: 'muted', in_review: 'blue', approved: 'green', superseded: 'struck' }
const RUN_TONE: Record<string, 'amber' | 'red' | 'green' | 'struck' | 'blue'> = { in_progress: 'blue', at_hold: 'amber', stopped: 'red', completed: 'green', aborted: 'struck' }
const LEADERS = ROLE_TIERS.editor

export default function ProcedureEditor({ project, procedure, revisions, revision, steps: initialSteps, runs, systems, names, userId, role, documentsSlot, verifiedLineups = 0 }: {
  project: { id: string; code: string; name: string }
  procedure: { id: string; number: string; title: string; kind: string; systemId: string | null; currentRevisionId: string | null }
  revisions: { id: string; rev: number; status: string }[]
  revision: Revision
  steps: StepDraft[]
  runs: { id: string; number: string; status: string; startedAt: string; completedAt: string | null; system: string | null }[]
  systems: { id: string; code: string; name: string }[]
  names: Record<string, string>
  userId: string
  role: string
  /** Fase 8: documentos referenciados por la revisión (bloquea enviar/aprobar con una revisión superada). */
  documentsSlot?: React.ReactNode
  /** S25b (E-32): line-ups verificados vigentes vinculados a este procedimiento. */
  verifiedLineups?: number
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [meta, setMeta] = useState({ title: procedure.title, kind: procedure.kind as ProcedureKind, systemId: procedure.systemId ?? '' })
  const [sections, setSections] = useState<Record<string, string>>(revision.sections)
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps)
  const [reason, setReason] = useState(revision.changeReason ?? '')
  const [open, setOpen] = useState<Set<string>>(new Set(['purpose', 'safety', 'sequence']))
  const [runSystem, setRunSystem] = useState(procedure.systemId ?? '')
  // S25b (E-34): diálogos propios en vez de window.prompt / window.confirm.
  const { dialog, ask } = useAskDialog()

  const isClient = role === 'client'
  const editable = revision.status === 'draft' && !isClient
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const ids = { projectId: project.id, procedureId: procedure.id, revisionId: revision.id }
  const isCurrent = revision.id === procedure.currentRevisionId
  const openRev = revisions.find(r => r.status === 'draft' || r.status === 'in_review')
  const root = `/projects/${project.id}/startup`

  function run(fn: () => Promise<{ error?: string; id?: string }>, after?: (res: { id?: string }) => void, markSaved = false) {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.(res)
      if (markSaved) setSaved(true)
      router.refresh()
    })
  }
  const saveContent = () => saveProcedureRevision({ ...ids, sections, steps, changeReason: reason })
  async function saveAll() {
    const m = await updateProcedure({ ...ids, ...meta, systemId: meta.systemId || null })
    if (m.error) return m
    return saveContent()
  }
  function submit() { run(async () => { const s = await saveAll(); if (s.error) return s; return transitionProcedureRevision({ ...ids, to: 'in_review' }) }) }
  async function giveBack() {
    const c = await ask({ title: t('editor.returnTitle'), confirmLabel: t('editor.return'), input: { label: t('editor.returnPrompt'), minLength: 3 } })
    if (c) run(() => transitionProcedureRevision({ ...ids, to: 'draft', comment: c }))
  }
  async function approve() {
    if ((await ask({ title: t('editor.approve'), message: t('editor.approveConfirm'), confirmLabel: t('editor.approve') })) !== null) run(() => transitionProcedureRevision({ ...ids, to: 'approved' }))
  }
  async function fieldVerify() {
    const note = await ask({ title: t('editor.fieldVerify'), confirmLabel: t('editor.fieldVerify'), input: { label: t('editor.walkdownPrompt'), minLength: 3 } })
    if (note) run(() => fieldVerifyProcedure({ ...ids, note }))
  }
  async function newRev() {
    const r = await ask({ title: t('editor.newRev'), confirmLabel: t('editor.newRev'), input: { label: t('editor.newRevPrompt'), minLength: 3 } })
    if (r) run(() => newProcedureRevision({ projectId: project.id, procedureId: procedure.id, reason: r }), res => router.push(`${root}/procedures/${procedure.id}?rev=${res.id}`))
  }
  /** S25b (E-32): avisa antes de ejecutar sin verificación en campo o sin line-up verificado vinculado. */
  async function startRun() {
    const warnings = [!revision.fieldVerifiedAt && t('editor.warnNotFieldVerified'), verifiedLineups === 0 && t('editor.warnNoLineup')].filter(Boolean) as string[]
    if (warnings.length && (await ask({ title: t('editor.startRun'), message: `${warnings.join('\n')}\n\n${t('editor.startAnyway')}`, confirmLabel: t('editor.startRun') })) === null) return
    run(() => startProcedureRun({ projectId: project.id, procedureId: procedure.id, systemId: runSystem || null }), res => router.push(`${root}/runs/${res.id}`))
  }
  async function remove() {
    if ((await ask({ title: t('editor.delete'), message: t('editor.deleteConfirm'), confirmLabel: t('editor.delete'), danger: true })) === null) return
    run(() => deleteProcedureDraft({ projectId: project.id, procedureId: procedure.id }), () => router.push(root))
  }

  const setStep = (i: number, patch: Partial<StepDraft>) => setSteps(list => list.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, d: number) => setSteps(list => {
    const j = i + d
    if (j < 0 || j >= list.length) return list
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next
  })
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <div>
        <Link href={root} style={linkStyle}>← {t('title')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{procedure.number}</h1>
          <Chip tone={REV_TONE[revision.status]}>R{revision.rev} · {t(`revStatus.${revision.status}`)}</Chip>
          {isCurrent && <Chip tone="green">{t('editor.current')}</Chip>}
          {revision.status === 'approved' && (revision.fieldVerifiedAt ? <Chip tone="green">{t('fieldVerified')}</Chip> : <Chip tone="amber">{t('notFieldVerified')}</Chip>)}
        </div>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-strong)', margin: '6px 0 0' }}>{procedure.title}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {revisions.map(r => (
            <Link key={r.id} href={`${root}/procedures/${procedure.id}?rev=${r.id}`}
              style={{ ...small, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', textDecoration: 'none', fontWeight: r.id === revision.id ? 700 : 400, background: r.id === revision.id ? 'var(--gray-100)' : 'transparent' }}>
              R{r.rev} · {t(`revStatus.${r.status}`)}
            </Link>
          ))}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {saved && <Alert kind="ok">{t('saved')}</Alert>}
      {revision.returnedReason && revision.status === 'draft' && <Alert kind="warn">{t('editor.returned', { reason: revision.returnedReason })}</Alert>}

      {/* Ciclo de la revisión */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ul style={{ ...small, margin: 0, paddingLeft: 18 }} suppressHydrationWarning>
          <li>{t('editor.author', { who: who(revision.createdBy) })}{revision.changeReason ? ` · ${revision.changeReason}` : ''}</li>
          {revision.approvedAt && <li>{t('editor.approvedBy', { who: who(revision.approvedBy), when: when(revision.approvedAt) })}</li>}
          {revision.fieldVerifiedAt && <li>{t('editor.verifiedBy', { who: who(revision.fieldVerifiedBy), when: when(revision.fieldVerifiedAt) })} — <em>{revision.walkdownNote}</em></li>}
          {revision.hash && <li style={{ fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-xs)' }}>sha256 {revision.hash}</li>}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editable && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={() => run(saveAll, undefined, true)}>{t('save')}</button>}
          {editable && <button type="button" style={btn('primary', isPending || steps.length === 0)} disabled={isPending || steps.length === 0} onClick={submit}>{t('editor.submit')}</button>}
          {revision.status === 'in_review' && !isClient && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={giveBack}>{t('editor.return')}</button>}
          {revision.status === 'in_review' && LEADERS.includes(role) && (
            <button type="button" style={btn('primary', isPending || userId === revision.createdBy || userId === revision.submittedBy || revision.editors.includes(userId))}
              disabled={isPending || userId === revision.createdBy || userId === revision.submittedBy || revision.editors.includes(userId)} onClick={approve}>{t('editor.approve')}</button>
          )}
          {revision.status === 'approved' && !revision.fieldVerifiedAt && !isClient && (
            <button type="button" style={btn('outline', isPending || userId === revision.approvedBy)} disabled={isPending || userId === revision.approvedBy} onClick={fieldVerify}>{t('editor.fieldVerify')}</button>
          )}
          {isCurrent && !openRev && !isClient && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={newRev}>{t('editor.newRev')}</button>}
          <a href={`${root}/procedures/${procedure.id}/pdf?rev=${revision.id}`} target="_blank" rel="noopener" style={btn('outline')}>PDF</a>
          {editable && !procedure.currentRevisionId && runs.length === 0 && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('editor.delete')}</button>}
        </div>
        {revision.status === 'in_review' && (userId === revision.createdBy || userId === revision.submittedBy || revision.editors.includes(userId)) && <p style={{ ...small, margin: 0 }}>{t('editor.otherApproves')}</p>}
        {revision.status === 'approved' && userId === revision.approvedBy && !revision.fieldVerifiedAt && <p style={{ ...small, margin: 0 }}>{t('editor.otherVerifies')}</p>}
      </section>

      {/* Datos del procedimiento */}
      <section style={{ ...card }}>
        <div style={grid}>
          <Field text={t('field.title')} wide><input style={input} value={meta.title} disabled={!editable} onChange={e => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field text={t('field.kind')}>
            <select style={input} value={meta.kind} disabled={!editable} onChange={e => setMeta({ ...meta, kind: e.target.value as ProcedureKind })}>
              {PROCEDURE_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </select>
          </Field>
          <Field text={t('field.system')}><SystemSelect value={meta.systemId} onChange={v => setMeta({ ...meta, systemId: v })} systems={systems} disabled={!editable} emptyLabel={t('field.anySystem')} /></Field>
          {revision.rev > 0 && <Field text={t('field.changeReason')} wide><input style={input} value={reason} disabled={!editable} onChange={e => setReason(e.target.value)} /></Field>}
        </div>
      </section>

      {/* 15 secciones */}
      {documentsSlot}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={t('editor.sections')}>
        <div style={label}>{t('editor.sections')}</div>
        {PROCEDURE_SECTIONS.map((k, i) => (
          <div key={k} style={{ borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: i ? 6 : 0 }}>
            <button type="button" onClick={() => toggle(k)} aria-expanded={open.has(k)}
              style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-strong)', display: 'flex', gap: 8, width: '100%' }}>
              <span style={{ width: 22, color: 'var(--text-muted)' }}>{i + 1}.</span>{t(`section.${k}`)}
              {sections[k]?.trim() ? <span style={{ ...small, marginLeft: 'auto' }}>✓</span> : null}
            </button>
            {open.has(k) && (
              k === 'sequence'
                ? <StepsEditor projectId={project.id} steps={steps} editable={editable} setStep={setStep} move={move}
                    add={() => setSteps(s => [...s, emptyStep()])} remove={i2 => setSteps(s => s.filter((_, j) => j !== i2))} />
                : <textarea rows={3} style={{ ...input, marginTop: 4 }} value={sections[k as ProcedureSection] ?? ''} disabled={!editable} maxLength={20000}
                    placeholder={editable ? t(`hint.${k}`) : ''} onChange={e => setSections(s => ({ ...s, [k]: e.target.value }))} />
            )}
          </div>
        ))}
      </section>

      {/* Ejecuciones */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={t('editor.runs')}>
        <div style={label}>{t('editor.runs')}</div>
        {procedure.currentRevisionId && !isClient && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!procedure.systemId && <SystemSelect value={runSystem} onChange={setRunSystem} systems={systems} emptyLabel={t('field.pick')} />}
            <button type="button" style={btn('primary', isPending || (!procedure.systemId && !runSystem))} disabled={isPending || (!procedure.systemId && !runSystem)} onClick={startRun}>{t('editor.startRun')}</button>
          </div>
        )}
        {!procedure.currentRevisionId && <p style={{ ...small, margin: 0 }}>{t('editor.needsApproval')}</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {runs.map(r => (
            <li key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
              <Link href={`${root}/runs/${r.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}>{r.number}</Link>
              <Chip tone={RUN_TONE[r.status] ?? 'muted'}>{t(`runStatus.${r.status}`)}</Chip>
              {r.system && <span style={small}>{r.system}</span>}
              <span style={small} suppressHydrationWarning>{when(r.startedAt)}</span>
            </li>
          ))}
          {runs.length === 0 && <li style={small}>{t('editor.noRuns')}</li>}
        </ul>
      </section>
    </div>
  )
}

function StepsEditor({ projectId, steps, editable, setStep, move, add, remove }: {
  projectId: string; steps: StepDraft[]; editable: boolean
  setStep: (i: number, p: Partial<StepDraft>) => void; move: (i: number, d: number) => void; add: () => void; remove: (i: number) => void
}) {
  const t = useTranslations('Startup')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ border: `1px solid ${s.is_hold_point ? '#fcd34d' : 'var(--border)'}`, background: s.is_hold_point ? '#fffbeb' : 'transparent', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{i + 1}</strong>
            <input aria-label={t('step.action')} placeholder={t('step.action')} style={{ ...input, flex: 1 }} value={s.action} disabled={!editable} onChange={e => setStep(i, { action: e.target.value })} />
            {editable && (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <button type="button" style={btn('outline')} onClick={() => move(i, -1)} aria-label={t('step.up')}>↑</button>
                <button type="button" style={btn('outline')} onClick={() => move(i, 1)} aria-label={t('step.down')}>↓</button>
                <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} onClick={() => remove(i)} aria-label={t('step.remove')}>✕</button>
              </span>
            )}
          </div>
          <div style={grid}>
            <Field text={t('step.responsible')}><input style={input} value={s.responsible} disabled={!editable} onChange={e => setStep(i, { responsible: e.target.value })} /></Field>
            <Field text={t('step.expected')}><input style={input} value={s.expected_value} disabled={!editable} onChange={e => setStep(i, { expected_value: e.target.value })} /></Field>
            <Field text={t('step.range')}>
              <span style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...input, width: 80 }} inputMode="decimal" aria-label={t('step.min')} placeholder={t('step.min')} value={s.expected_min ?? ''} disabled={!editable} onChange={e => setStep(i, { expected_min: e.target.value })} />
                <input style={{ ...input, width: 80 }} inputMode="decimal" aria-label={t('step.max')} placeholder={t('step.max')} value={s.expected_max ?? ''} disabled={!editable} onChange={e => setStep(i, { expected_max: e.target.value })} />
                <input style={{ ...input, width: 80 }} aria-label={t('step.unit')} placeholder={t('step.unit')} value={s.expected_unit ?? ''} disabled={!editable} onChange={e => setStep(i, { expected_unit: e.target.value })} />
              </span>
            </Field>
            <Field text={t('step.stop')}><input style={input} value={s.stop_criteria} disabled={!editable} placeholder={t('step.stopHint')} onChange={e => setStep(i, { stop_criteria: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
              <input type="checkbox" checked={s.is_hold_point} disabled={!editable} onChange={e => setStep(i, { is_hold_point: e.target.checked })} /> {t('step.hold')}
            </label>
            {s.is_hold_point && (
              <select aria-label={t('step.capacity')} style={{ ...input, width: 220 }} value={s.hold_capacity} disabled={!editable} onChange={e => setStep(i, { hold_capacity: e.target.value as HoldCapacity })}>
                {HOLD_CAPACITIES.map(c => <option key={c} value={c}>{t('step.releasedBy', { who: t(`capacity.${c}`) })}</option>)}
              </select>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <TagPicker projectId={projectId} kind="temporary" disabled={!editable}
                value={s.tag_id ? [{ tag_id: s.tag_id, tag_number: s.tag_number ?? '?', role: 'subject' }] : []}
                onChange={v => { const last = v.at(-1); setStep(i, { tag_id: last?.tag_id ?? null, tag_number: last?.tag_number ?? null }) }} />
            </div>
          </div>
        </div>
      ))}
      {steps.length === 0 && <p style={{ ...small, margin: 0 }}>{t('step.none')}</p>}
      {editable && <div><button type="button" style={btn('outline')} onClick={add}>+ {t('step.add')}</button></div>}
    </div>
  )
}
