'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { completeRunStep, releaseHoldPoint, transitionProcedureRun } from '@/app/actions/startup'
import type { MyCapacities } from '@/lib/constants/capacities'
import { canReleaseHold, nextRunStep, runProgress, type HoldCapacity, type RunStepStatus } from '@/lib/startup/catalog'
import { networkActionsAllowed, overlayRun, type StartupEntry } from '@/lib/sync/startup-outbox-utils'
import { Alert, Chip, btn, card, input, small } from '../../../daily/daily-ui'
import { SyncBanner, SyncTray, useStartupOutbox } from '../../OfflineSync'
import { useLocalTime } from '@/lib/use-local-time'
import { ROLE_TIERS } from '@/lib/constants/roles'

type Step = {
  stepId: string; ord: number; status: RunStepStatus; actual: string | null; comment: string | null
  doneBy: string | null; doneAt: string | null; releasedBy: string | null; releasedAt: string | null; releaseComment: string | null
  action: string; responsible: string | null; expected: string | null; isHold: boolean; capacity: HoldCapacity; stopCriteria: string | null; tag: string | null
}
type Run = {
  id: string; number: string; status: string; procedureId: string; procedureNumber: string; title: string; rev: number
  safety: string | null; stopCriteria: string | null; system: string | null; stopReason: string | null; abortReason: string | null
  startedBy: string | null; startedAt: string; completedAt: string | null
}
const STATUS_TONE: Record<string, 'blue' | 'amber' | 'red' | 'green' | 'struck'> = { in_progress: 'blue', at_hold: 'amber', stopped: 'red', completed: 'green', aborted: 'struck' }
const STEP_TONE: Record<RunStepStatus, 'muted' | 'green' | 'amber' | 'violet'> = { pending: 'muted', done: 'green', at_hold: 'amber', released: 'green', na: 'violet' }
const LEADERS = ROLE_TIERS.editor
const big = (primary: boolean, disabled = false): React.CSSProperties => ({ ...btn(primary ? 'primary' : 'outline', disabled), padding: '12px 18px', fontSize: 'var(--text-base)' })

/** S25 (E-10): línea de tiempo de la ejecución (cada parada, reanudación y hold liberado). */
export type RunTimelineEntry = { id: string; kind: 'started' | 'stopped' | 'resumed' | 'hold_released' | 'completed' | 'aborted'; userId: string | null; at: string; comment: string | null; stepOrd: number | null }

export default function RunView({ project, run: serverRun, steps: serverSteps, names, userId, role, caps, timeline }: {
  project: { id: string; code: string; name: string }; run: Run; steps: Step[]; names: Record<string, string>; userId: string; role: string
  /** S14 (D14): capacidades del usuario en el proyecto (designado o respaldo por rol). */
  caps: MyCapacities
  timeline: RunTimelineEntry[]
}) {
  const t = useTranslations('Startup')
  const tOff = useTranslations('Startup.offline')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [actual, setActual] = useState('')
  const [note, setNote] = useState('')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const ids = { projectId: project.id, runId: serverRun.id }
  // Offline (F6): lo capturado sin red se superpone a lo que trajo el servidor hasta sincronizar.
  const outbox = useStartupOutbox('run', serverRun.id)
  const ov = overlayRun(serverRun, serverSteps, outbox.entries, userId)
  const run = { ...serverRun, status: ov.status, stopReason: ov.stopReason }
  const steps = ov.steps
  const netOk = networkActionsAllowed(!outbox.isOffline, outbox.entries.length)
  const netHint = outbox.isOffline ? tOff('needsNetwork') : tOff('syncFirst')
  const next = run.status === 'in_progress' && !ov.locked ? nextRunStep(steps) : null
  const hold = steps.find(s => s.status === 'at_hold')
  const prog = runProgress(steps)
  const isClient = role === 'client'
  const live = ['in_progress', 'at_hold', 'stopped'].includes(run.status)

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      setActual(''); setNote('')
      router.refresh()
    })
  }
  const askThen = (msg: string, fn: (c: string) => Promise<{ error?: string }>) => { const c = window.prompt(msg); if (c?.trim()) act(() => fn(c)) }
  /** Paso o «Detener»: en línea si se puede; si no, queda en el dispositivo (se envía en orden al volver la red). */
  function capture(op: Parameters<typeof outbox.capture>[0], send: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await outbox.capture(op, send, outbox.entries.length > 0)
      if ('error' in res) { setError(res.error); return }
      setActual(''); setNote('')
    })
  }
  const stepLabel = (e: StartupEntry) => {
    if (e.kind === 'run_stop') return `⛔ ${tOff('stopLabel', { reason: e.comment })}`
    if (e.kind !== 'run_step') return ''
    const s = serverSteps.find(x => x.stepId === e.stepId)
    return `${tOff('stepLabel', { n: e.ord })} · ${e.na ? t('run.na') : t('run.done')}${s ? ` — ${s.action}` : ''}`
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link href={`/projects/${project.id}/startup/procedures/${run.procedureId}`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)' }}>← {run.procedureNumber} R{run.rev}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{run.number}</h1>
          <Chip tone={STATUS_TONE[run.status] ?? 'muted'}>{t(`runStatus.${run.status}`)}</Chip>
          <span style={small}>{prog.closed}/{prog.total}</span>
          <a href={`/projects/${project.id}/startup/runs/${run.id}/pdf`} target="_blank" rel="noopener" style={{ ...btn('outline'), marginLeft: 'auto', textDecoration: 'none' }} title="PDF">PDF</a>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-strong)' }}>{run.title}</p>
        <p style={{ ...small, margin: '2px 0 0' }} suppressHydrationWarning>{run.system ?? '—'} · {t('run.startedBy', { who: who(run.startedBy), when: when(run.startedAt) })}</p>
      </div>

      <SyncBanner isOffline={outbox.isOffline} count={outbox.sendable} syncing={outbox.syncing} onSync={() => void outbox.sync()} />
      {error && <Alert kind="error">{error}</Alert>}
      <SyncTray entries={outbox.entries} isOffline={outbox.isOffline} describe={stepLabel} onChanged={() => void outbox.sync()} />
      {ov.locked && <Alert kind="warn">{tOff('locked')}</Alert>}
      {(!!run.safety || !!run.stopCriteria) && (
        <details style={{ ...card, padding: 12 }}>
          <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{t('run.safetyAndStop')}</summary>
          {run.safety && <p style={{ ...small, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}><strong>{t('section.safety')}:</strong> {run.safety}</p>}
          {run.stopCriteria && <p style={{ ...small, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}><strong>{t('section.stop_criteria')}:</strong> {run.stopCriteria}</p>}
        </details>
      )}

      {run.status === 'stopped' && (
        <Alert kind="error">
          {t('run.stopped', { reason: run.stopReason ?? '' })}
          {LEADERS.includes(role) && <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" style={btn('primary', isPending || !netOk)} disabled={isPending || !netOk}
            onClick={() => askThen(t('run.resumePrompt'), c => transitionProcedureRun({ ...ids, to: 'in_progress', comment: c }))}>{t('run.resume')}</button>{!netOk && <span style={small}>{netHint}</span>}</div>}
        </Alert>
      )}
      {run.status === 'aborted' && <Alert kind="warn">{t('run.aborted', { reason: run.abortReason ?? '' })}</Alert>}
      {run.status === 'completed' && <Alert kind="ok">{t('run.completed', { when: when(run.completedAt) })}</Alert>}

      {hold && (
        <section style={{ ...card, borderColor: '#fcd34d', background: '#fffbeb', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ color: '#b45309' }}>⏸ {t('run.holdTitle', { n: hold.ord, who: t(`capacity.${hold.capacity}`) })}</strong>
          <span style={small} suppressHydrationWarning>{t('run.holdDoneBy', { who: who(hold.doneBy), when: when(hold.doneAt) })}</span>
          {hold.sync === 'pending' ? <span style={small}>{tOff('holdPending')}</span> : canReleaseHold(caps, hold.capacity, userId, hold.doneBy) ? (
            <>
              <input style={input} placeholder={t('run.releaseComment')} value={note} onChange={e => setNote(e.target.value)} />
              <button type="button" style={big(true, isPending || !netOk)} disabled={isPending || !netOk}
                onClick={() => act(() => releaseHoldPoint({ ...ids, stepId: hold.stepId, comment: note }))}>{t('run.release')}</button>
              {!netOk && <span style={small}>{netHint}</span>}
            </>
          ) : <span style={small}>{hold.doneBy === userId ? t('run.holdOther') : t(caps[hold.capacity].designated ? 'run.holdDesignated' : 'run.holdRole', { who: t(`capacity.${hold.capacity}`) })}</span>}
        </section>
      )}

      {next && !isClient && (
        <section style={{ ...card, borderColor: 'var(--primary-500)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 18, fontFamily: 'ui-monospace, monospace' }}>{next.ord}</strong>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-strong)', fontWeight: 600 }}>{next.action}</span>
          </div>
          <div style={{ ...small, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {next.tag && <span>🏷 {next.tag}</span>}
            {next.responsible && <span>👤 {next.responsible}</span>}
            {next.expected && <span>🎯 {next.expected}</span>}
          </div>
          {next.stopCriteria && <div style={{ ...small, color: 'var(--danger-700)', fontWeight: 600 }}>⛔ {t('run.stopIf', { c: next.stopCriteria })}</div>}
          {next.isHold && <div style={{ ...small, color: '#b45309', fontWeight: 600 }}>⏸ {t('run.isHold', { who: t(`capacity.${next.capacity}`) })}</div>}
          <input style={input} placeholder={next.expected ? t('run.actualFor', { e: next.expected }) : t('run.actual')} value={actual} onChange={e => setActual(e.target.value)} />
          <input style={input} placeholder={t('run.comment')} value={note} onChange={e => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={big(true, isPending)} disabled={isPending}
              onClick={() => capture(
                { kind: 'run_step', ...ids, stepId: next.stepId, ord: next.ord, isHold: next.isHold, na: false, actual: actual.trim() || null, comment: note.trim() || null },
                () => completeRunStep({ ...ids, stepId: next.stepId, actual, comment: note }),
              )}>✓ {next.isHold ? t('run.doneHold') : t('run.done')}</button>
            {!next.isHold && <button type="button" style={big(false, isPending || note.trim().length < 3)} disabled={isPending || note.trim().length < 3}
              onClick={() => capture(
                { kind: 'run_step', ...ids, stepId: next.stepId, ord: next.ord, isHold: false, na: true, actual: null, comment: note.trim() },
                () => completeRunStep({ ...ids, stepId: next.stepId, comment: note, na: true }),
              )}>{t('run.na')}</button>}
          </div>
        </section>
      )}

      {run.status === 'in_progress' && !next && !hold && prog.closed === prog.total && !isClient && (
        <>
          <button type="button" style={big(true, isPending || !netOk)} disabled={isPending || !netOk} onClick={() => act(() => transitionProcedureRun({ ...ids, to: 'completed' }))}>{t('run.complete')}</button>
          {!netOk && <span style={small}>{netHint}</span>}
        </>
      )}

      {live && !isClient && run.status !== 'stopped' && (
        <button type="button" style={{ ...big(false, isPending), color: '#fff', background: 'var(--danger-500)', border: 'none' }} disabled={isPending}
          onClick={() => {
            const c = window.prompt(t('run.stopPrompt'))
            if (c?.trim()) capture({ kind: 'run_stop', ...ids, comment: c.trim() }, () => transitionProcedureRun({ ...ids, to: 'stopped', comment: c }))
          }}>⛔ {t('run.stop')}</button>
      )}

      <section style={{ ...card, padding: 0 }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map(s => (
            <li key={s.stepId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start', opacity: s.status === 'pending' && s.stepId !== next?.stepId ? 0.6 : 1 }}>
              <strong style={{ width: 22, fontFamily: 'ui-monospace, monospace' }}>{s.ord}</strong>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{s.isHold ? '⏸ ' : ''}{s.action}</div>
                {s.status !== 'pending' && (
                  <div style={{ ...small, fontSize: 'var(--text-xs)' }} suppressHydrationWarning>
                    {who(s.doneBy)} · {when(s.doneAt)}{s.actual ? ` · ${s.actual}` : ''}{s.comment ? ` — ${s.comment}` : ''}
                    {s.releasedAt && ` · ${t('run.releasedBy', { who: who(s.releasedBy), when: when(s.releasedAt) })}`}
                    {s.releaseComment && ` — ${s.releaseComment}`}
                  </div>
                )}
              </div>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <Chip tone={STEP_TONE[s.status]}>{t(`stepStatus.${s.status}`)}</Chip>
                {s.sync === 'pending' && <Chip tone="blue">{tOff('chipPending')}</Chip>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {timeline.length > 0 && (
        <section style={card} aria-label={t('run.timeline')}>
          <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>{t('run.timeline')}</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {timeline.map(e => (
              <li key={e.id} style={{ ...small, display: 'flex', gap: 8 }} suppressHydrationWarning>
                <span style={{ minWidth: 150 }}>{when(e.at)}</span>
                <span style={{ color: e.kind === 'stopped' || e.kind === 'aborted' ? 'var(--danger-700)' : 'var(--text-strong)', fontWeight: 600 }}>
                  {t(`run.event.${e.kind}`)}{e.stepOrd !== null ? ` #${e.stepOrd}` : ''}
                </span>
                <span>{who(e.userId)}{e.comment ? ` — ${e.comment}` : ''}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {live && LEADERS.includes(role) && (
        <button type="button" style={{ ...btn('outline', !netOk), color: 'var(--danger-700)', alignSelf: 'flex-start' }} disabled={isPending || !netOk} title={netOk ? undefined : netHint}
          onClick={() => askThen(t('run.abortPrompt'), c => transitionProcedureRun({ ...ids, to: 'aborted', comment: c }))}>{t('run.abort')}</button>
      )}
    </div>
  )
}
