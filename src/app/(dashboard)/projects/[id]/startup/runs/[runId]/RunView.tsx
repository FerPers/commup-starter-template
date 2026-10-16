'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { completeRunStep, releaseHoldPoint, transitionProcedureRun } from '@/app/actions/startup'
import { canReleaseHold, nextRunStep, runProgress, type HoldCapacity, type RunStepStatus } from '@/lib/startup/catalog'
import { Alert, Chip, btn, card, input, small } from '../../../daily/daily-ui'

type Step = {
  stepId: string; ord: number; status: RunStepStatus; actual: string | null; comment: string | null
  doneBy: string | null; doneAt: string | null; releasedBy: string | null; releasedAt: string | null
  action: string; responsible: string | null; expected: string | null; isHold: boolean; capacity: HoldCapacity; stopCriteria: string | null; tag: string | null
}
type Run = {
  id: string; number: string; status: string; procedureId: string; procedureNumber: string; title: string; rev: number
  safety: string | null; stopCriteria: string | null; system: string | null; stopReason: string | null; abortReason: string | null
  startedBy: string | null; startedAt: string; completedAt: string | null
}
const STATUS_TONE: Record<string, 'blue' | 'amber' | 'red' | 'green' | 'struck'> = { in_progress: 'blue', at_hold: 'amber', stopped: 'red', completed: 'green', aborted: 'struck' }
const STEP_TONE: Record<RunStepStatus, 'muted' | 'green' | 'amber' | 'violet'> = { pending: 'muted', done: 'green', at_hold: 'amber', released: 'green', na: 'violet' }
const LEADERS = ['owner', 'admin', 'architect', 'leader']
const big = (primary: boolean, disabled = false): React.CSSProperties => ({ ...btn(primary ? 'primary' : 'outline', disabled), padding: '12px 18px', fontSize: 'var(--text-base)' })

export default function RunView({ project, run, steps, names, userId, role }: {
  project: { id: string; code: string; name: string }; run: Run; steps: Step[]; names: Record<string, string>; userId: string; role: string
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [actual, setActual] = useState('')
  const [note, setNote] = useState('')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')
  const ids = { projectId: project.id, runId: run.id }
  const next = run.status === 'in_progress' ? nextRunStep(steps) : null
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

  return (
    <div style={{ padding: '20px 16px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link href={`/projects/${project.id}/startup/procedures/${run.procedureId}`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)' }}>← {run.procedureNumber} R{run.rev}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{run.number}</h1>
          <Chip tone={STATUS_TONE[run.status] ?? 'muted'}>{t(`runStatus.${run.status}`)}</Chip>
          <span style={small}>{prog.closed}/{prog.total}</span>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-strong)' }}>{run.title}</p>
        <p style={{ ...small, margin: '2px 0 0' }} suppressHydrationWarning>{run.system ?? '—'} · {t('run.startedBy', { who: who(run.startedBy), when: when(run.startedAt) })}</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
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
          {LEADERS.includes(role) && <div style={{ marginTop: 8 }}><button type="button" style={btn('primary', isPending)} disabled={isPending}
            onClick={() => askThen(t('run.resumePrompt'), c => transitionProcedureRun({ ...ids, to: 'in_progress', comment: c }))}>{t('run.resume')}</button></div>}
        </Alert>
      )}
      {run.status === 'aborted' && <Alert kind="warn">{t('run.aborted', { reason: run.abortReason ?? '' })}</Alert>}
      {run.status === 'completed' && <Alert kind="ok">{t('run.completed', { when: when(run.completedAt) })}</Alert>}

      {hold && (
        <section style={{ ...card, borderColor: '#fcd34d', background: '#fffbeb', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ color: '#b45309' }}>⏸ {t('run.holdTitle', { n: hold.ord, who: t(`capacity.${hold.capacity}`) })}</strong>
          <span style={small} suppressHydrationWarning>{t('run.holdDoneBy', { who: who(hold.doneBy), when: when(hold.doneAt) })}</span>
          {canReleaseHold(role, hold.capacity, userId, hold.doneBy) ? (
            <>
              <input style={input} placeholder={t('run.releaseComment')} value={note} onChange={e => setNote(e.target.value)} />
              <button type="button" style={big(true, isPending)} disabled={isPending}
                onClick={() => act(() => releaseHoldPoint({ ...ids, stepId: hold.stepId, comment: note }))}>{t('run.release')}</button>
            </>
          ) : <span style={small}>{hold.doneBy === userId ? t('run.holdOther') : t('run.holdRole', { who: t(`capacity.${hold.capacity}`) })}</span>}
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
              onClick={() => act(() => completeRunStep({ ...ids, stepId: next.stepId, actual, comment: note }))}>✓ {next.isHold ? t('run.doneHold') : t('run.done')}</button>
            {!next.isHold && <button type="button" style={big(false, isPending || note.trim().length < 3)} disabled={isPending || note.trim().length < 3}
              onClick={() => act(() => completeRunStep({ ...ids, stepId: next.stepId, comment: note, na: true }))}>{t('run.na')}</button>}
          </div>
        </section>
      )}

      {run.status === 'in_progress' && !next && !hold && prog.closed === prog.total && !isClient && (
        <button type="button" style={big(true, isPending)} disabled={isPending} onClick={() => act(() => transitionProcedureRun({ ...ids, to: 'completed' }))}>{t('run.complete')}</button>
      )}

      {live && !isClient && run.status !== 'stopped' && (
        <button type="button" style={{ ...big(false, isPending), color: '#fff', background: 'var(--danger-500)', border: 'none' }} disabled={isPending}
          onClick={() => askThen(t('run.stopPrompt'), c => transitionProcedureRun({ ...ids, to: 'stopped', comment: c }))}>⛔ {t('run.stop')}</button>
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
                  </div>
                )}
              </div>
              <Chip tone={STEP_TONE[s.status]}>{t(`stepStatus.${s.status}`)}</Chip>
            </li>
          ))}
        </ol>
      </section>

      {live && LEADERS.includes(role) && (
        <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)', alignSelf: 'flex-start' }} disabled={isPending}
          onClick={() => askThen(t('run.abortPrompt'), c => transitionProcedureRun({ ...ids, to: 'aborted', comment: c }))}>{t('run.abort')}</button>
      )}
    </div>
  )
}
