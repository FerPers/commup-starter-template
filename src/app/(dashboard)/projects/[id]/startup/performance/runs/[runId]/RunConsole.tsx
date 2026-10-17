'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  abortPerformanceRun, addPerformanceManualReading, advancePerformanceRun, closePerformanceRun, deletePerformanceManualReading,
  endPerformanceDisturbance, recordPerformanceDisturbance, refreezePerformanceRun, setPerformanceDisturbanceExclusion,
} from '@/app/actions/performance'
import {
  DISTURBANCE_KINDS, RESULT_TONE, fmtMinutes, isPerformanceLead, runClock, toLocalInput,
  type DisturbanceKind, type Evaluation, type PerfResult, type PerfRunStatus, type VariableSource,
} from '@/lib/performance/catalog'
import EvaluationPanel from './EvaluationPanel'
import { Alert, Chip, Field, btn, card, grid, input, label, small } from '../../../../daily/daily-ui'
import { RUN_TONE } from '../../PerformanceView'

type Run = {
  id: string; number: string; status: PerfRunStatus; created_at: string
  stabilization_started_by: string | null; stabilization_started_at: string | null
  formal_started_by: string | null; formal_started_at: string | null; formal_start_note: string | null
  closed_by: string | null; closed_at: string | null; early_close: boolean; early_close_reason: string | null
  frozen_at: string | null; frozen_rows: number | null; aborted_by: string | null; aborted_at: string | null; abort_reason: string | null
  result: PerfResult | null; result_reason: string | null; result_by: string | null; result_at: string | null; evaluation_hash: string | null
}
type Variable = { id: string; key: string; label: string; unit: string | null; source: VariableSource }
type Point = { variableId: string; bucket: string; value: number | null; source: 'iiot' | 'manual'; enteredBy: string | null }
type Disturbance = {
  id: string; started_at: string; ended_at: string | null; kind: DisturbanceKind; description: string; recorded_by: string | null
  excluded: boolean; exclusion_reason: string | null; excluded_by: string | null
}

// Reloj compartido por minuto (useSyncExternalStore: sin setState en efectos ni desajuste de hidratación).
const TICK = 30000
function subscribe(cb: () => void) { const h = setInterval(cb, TICK); return () => clearInterval(h) }
const snapshot = () => Math.floor(Date.now() / TICK) * TICK
const serverSnapshot = () => 0

const MAX_POINTS = 720
function downsample<T>(arr: T[]): T[] {
  if (arr.length <= MAX_POINTS) return arr
  const step = Math.ceil(arr.length / MAX_POINTS)
  return arr.filter((_, i) => i % step === 0)
}
/** <input type="datetime-local"> (hora local) → ISO; vacío = ahora (null). */
const localToIso = (v: string) => (v ? new Date(v).toISOString() : null)

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const sectionTitle: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }

export default function RunConsole({ project, test, run, rev, variables, points, disturbances, names, userId, role, evaluation, evaluationError, action }: {
  project: { id: string; code: string; name: string }
  test: { id: string; number: string; title: string }
  run: Run
  evaluation: Evaluation | null; evaluationError: string | null; action: { id: string; number: string; status: string } | null
  rev: { rev: number; stabilization_min: number; formal_min: number; sample_interval_s: number; outdated: boolean }
  variables: Variable[]; points: Point[]; disturbances: Disturbance[]
  names: Record<string, string>; userId: string; role: string
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [dist, setDist] = useState({ kind: 'load_change' as DisturbanceKind, description: '', startedAt: '', endedAt: '' })
  const [reading, setReading] = useState({ variableId: variables.find(v => v.source === 'manual')?.id ?? '', at: '', value: '' })

  const root = `/projects/${project.id}/startup/performance`
  const ids = { projectId: project.id, runId: run.id }
  const lead = isPerformanceLead(role)
  const member = role !== 'client'
  const live = run.status === 'stabilizing' || run.status === 'formal'
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')
  const clock = now ? runClock(run, rev, now) : null
  // El campo de hora no tiene segundos: el mismo minuto del inicio de la estabilización cuenta desde ese instante.
  const inWindow = (v: string) => {
    const iso = localToIso(v)
    if (!iso || !run.stabilization_started_at) return iso
    const start = Date.parse(run.stabilization_started_at)
    // +1 ms: la BD guarda microsegundos y el ISO de JS solo milisegundos.
    return Date.parse(iso) <= start && Date.parse(iso) > start - 60000 ? new Date(start + 1).toISOString() : iso
  }

  function act(fn: () => Promise<{ error?: string; rows?: number }>, after?: (res: { rows?: number }) => void) {
    setError(null); setNotice(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.(res)
      router.refresh()
    })
  }

  const charted = variables.filter(v => v.source !== 'derived')
  const chartFrom = run.stabilization_started_at ? Date.parse(run.stabilization_started_at) : null
  const chartTo = run.closed_at ? Date.parse(run.closed_at) : now || null
  const manualVars = variables.filter(v => v.source === 'manual')
  const manualPoints = points.filter(p => p.source === 'manual').sort((a, b) => b.bucket.localeCompare(a.bucket))
  const varById = new Map(variables.map(v => [v.id, v]))

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link href={`${root}/${test.id}`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)' }}>← {test.number} · {test.title}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)' }}>{run.number}</h1>
          <Chip tone={RUN_TONE[run.status]}>{t(`perf.runStatus.${run.status}`)}</Chip>
          <span style={small}>R{rev.rev}</span>
          {run.early_close && <Chip tone="amber">{t('perf.earlyClose')}</Chip>}
          {run.result && <Chip tone={RESULT_TONE[run.result]}>{t(`perf.result.${run.result}`)}</Chip>}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}
      {rev.outdated && live && <Alert kind="warn">{t('perf.outdatedRun')}</Alert>}
      {run.status === 'aborted' && <Alert kind="warn">{t('perf.aborted', { who: who(run.aborted_by), when: when(run.aborted_at), reason: run.abort_reason ?? '' })}</Alert>}

      {/* Estado y reloj */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {(['stabilizing', 'formal', 'closed'] as const).map(phase => {
            const startedAt = phase === 'stabilizing' ? run.stabilization_started_at : phase === 'formal' ? run.formal_started_at : run.closed_at
            const by = phase === 'stabilizing' ? run.stabilization_started_by : phase === 'formal' ? run.formal_started_by : run.closed_by
            const active = run.status === phase || (phase === 'closed' && run.status === 'evaluated')
            return (
              <div key={phase} style={{ padding: 12, borderRadius: 10, border: `1px solid ${active ? 'var(--primary-500)' : 'var(--border)'}`, background: active ? '#eff6ff' : undefined }}>
                <div style={label}>{t(`perf.phase.${phase}`)}</div>
                {startedAt
                  ? <div style={{ ...small, marginTop: 4 }} suppressHydrationWarning>{when(startedAt)} · {who(by)}</div>
                  : <div style={{ ...small, marginTop: 4 }}>—</div>}
                {phase !== 'closed' && <div style={{ ...small, marginTop: 2 }}>{t('perf.minimum', { d: fmtMinutes(phase === 'stabilizing' ? rev.stabilization_min : rev.formal_min) })}</div>}
                {active && clock && phase !== 'closed' && (
                  <div style={{ marginTop: 6, fontSize: 'var(--text-lg, 18px)', fontWeight: 700, color: clock.done ? 'var(--success-700)' : 'var(--text-strong)' }}>
                    {fmtMinutes(clock.elapsedMin)} {clock.done ? `· ${t('perf.minReached')}` : `· ${t('perf.remaining', { d: fmtMinutes(clock.remainingMin ?? 0) })}`}
                  </div>
                )}
                {phase === 'formal' && run.formal_start_note && <div style={{ ...small, marginTop: 4, color: '#b45309' }}>{run.formal_start_note}</div>}
                {phase === 'closed' && run.closed_at && clock && <div style={{ ...small, marginTop: 4 }}>{t('perf.formalLasted', { d: fmtMinutes(clock.elapsedMin) })}</div>}
                {phase === 'closed' && run.early_close_reason && <div style={{ ...small, marginTop: 4, color: '#b45309' }}>{run.early_close_reason}</div>}
              </div>
            )
          })}
        </div>

        {lead && (run.status === 'planned' || live) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field text={t('perf.realTime')}>
              <input type="datetime-local" style={{ ...input, width: 210 }} value={at} max={now ? toLocalInput(now + 60000) : undefined} onChange={e => setAt(e.target.value)} />
            </Field>
            {run.status === 'formal' && clock && !clock.done && (
              <Field text={t('perf.earlyReason')}><input style={{ ...input, width: 320 }} value={note} onChange={e => setNote(e.target.value)} /></Field>
            )}
            {run.status === 'stabilizing' && clock && !clock.done && (
              <Field text={t('perf.earlyFormalReason')}><input style={{ ...input, width: 320 }} value={note} onChange={e => setNote(e.target.value)} /></Field>
            )}
            {run.status === 'planned' && <button type="button" style={btn('primary', isPending)} disabled={isPending}
              onClick={() => act(() => advancePerformanceRun({ ...ids, to: 'stabilizing', at: localToIso(at) }), () => setAt(''))}>▶ {t('perf.startStabilization')}</button>}
            {run.status === 'stabilizing' && <button type="button" style={btn('primary', isPending)} disabled={isPending}
              onClick={() => act(() => advancePerformanceRun({ ...ids, to: 'formal', at: localToIso(at), comment: note }), () => { setAt(''); setNote('') })}>▶ {t('perf.startFormal')}</button>}
            {run.status === 'formal' && <button type="button" style={btn('primary', isPending)} disabled={isPending}
              onClick={() => { if (window.confirm(t('perf.closeConfirm'))) act(() => closePerformanceRun({ ...ids, at: localToIso(at), reason: note }), res => { setAt(''); setNote(''); setNotice(t('perf.frozenRows', { n: res.rows ?? 0 })) }) }}>■ {t('perf.close')}</button>}
            <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending}
              onClick={() => { const r = window.prompt(t('perf.abortPrompt')); if (r?.trim()) act(() => abortPerformanceRun({ ...ids, reason: r.trim() })) }}>{t('perf.abort')}</button>
          </div>
        )}
        {(run.status === 'closed' || run.status === 'evaluated') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={small} suppressHydrationWarning>{t('perf.frozenAt', { n: run.frozen_rows ?? 0, when: when(run.frozen_at) })}</span>
            {lead && run.status === 'closed' && <button type="button" style={btn('outline', isPending)} disabled={isPending}
              onClick={() => act(() => refreezePerformanceRun(ids), res => setNotice(t('perf.frozenRows', { n: res.rows ?? 0 })))}>{t('perf.refreeze')}</button>}
          </div>
        )}
      </section>

      {(run.status === 'closed' || run.status === 'evaluated') && (
        <EvaluationPanel projectId={project.id} run={run} evaluation={evaluation} evaluationError={evaluationError} action={action} names={names} canLead={lead} />
      )}

      {/* Gráficos */}
      {chartFrom && chartTo && charted.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
          {charted.map(v => {
            const data = downsample(points.filter(p => p.variableId === v.id).map(p => ({ t: Date.parse(p.bucket), v: p.value })).sort((a, b) => a.t - b.t))
            return (
              <div key={v.id} style={{ ...card, padding: 12 }}>
                <div style={{ ...label, marginBottom: 6 }}>{v.key} · {v.label}{v.unit ? ` (${v.unit})` : ''}{v.source === 'manual' ? ` · ${t('perf.source.manual')}` : ''}</div>
                {data.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('perf.noData')}</p> : (
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="t" type="number" domain={[chartFrom, chartTo]} tick={{ fontSize: 10 }}
                        tickFormatter={x => new Date(Number(x)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                      <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                      <Tooltip labelFormatter={x => new Date(Number(x)).toLocaleString()} formatter={x => [String(x), v.key]} />
                      {disturbances.map(d => (
                        <ReferenceArea key={d.id} x1={Date.parse(d.started_at)} x2={d.ended_at ? Date.parse(d.ended_at) : chartTo}
                          fill={d.excluded ? '#9ca3af' : '#f59e0b'} fillOpacity={0.18} ifOverflow="hidden" />
                      ))}
                      {run.formal_started_at && <ReferenceLine x={Date.parse(run.formal_started_at)} stroke="var(--primary-500, #2563eb)" strokeDasharray="4 2" label={{ value: t('perf.phase.formal'), fontSize: 10, position: 'top' }} />}
                      <Line type="monotone" dataKey="v" stroke="var(--primary-500, #2563eb)" strokeWidth={2} dot={v.source === 'manual'} isAnimationActive={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )
          })}
        </section>
      )}

      {/* Perturbaciones */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={sectionTitle}>{t('perf.disturbances')}</h2>
        <p style={{ ...small, margin: 0 }}>{t('perf.disturbancesHint')}</p>
        {disturbances.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['window', 'kind', 'description', 'calc', ''].map(c => <th key={c} style={th}>{c ? t(`perf.dist.${c}`) : ''}</th>)}</tr></thead>
              <tbody>
                {disturbances.map(d => (
                  <tr key={d.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} suppressHydrationWarning>{when(d.started_at)} → {d.ended_at ? new Date(d.ended_at).toLocaleTimeString() : t('perf.dist.open')}</td>
                    <td style={td}>{t(`perf.distKind.${d.kind}`)}</td>
                    <td style={td}>{d.description}<div style={small}>{who(d.recorded_by)}</div></td>
                    <td style={td}>
                      {d.excluded ? <Chip tone="muted">{t('perf.dist.excluded')}</Chip> : <Chip tone="amber">{t('perf.dist.included')}</Chip>}
                      {d.exclusion_reason && <div style={small}>{d.exclusion_reason} · {who(d.excluded_by)}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {!d.ended_at && member && <button type="button" style={{ ...btn('outline'), padding: '4px 8px' }} disabled={isPending}
                        onClick={() => act(() => endPerformanceDisturbance({ ...ids, disturbanceId: d.id }))}>{t('perf.dist.end')}</button>}
                      {lead && (run.status === 'formal' || run.status === 'closed') && (
                        <button type="button" style={{ ...btn('outline'), padding: '4px 8px', marginLeft: 4 }} disabled={isPending}
                          onClick={() => { const r = window.prompt(t(d.excluded ? 'perf.dist.includePrompt' : 'perf.dist.excludePrompt')); if (r?.trim()) act(() => setPerformanceDisturbanceExclusion({ ...ids, disturbanceId: d.id, excluded: !d.excluded, reason: r.trim() })) }}>
                          {t(d.excluded ? 'perf.dist.include' : 'perf.dist.exclude')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {member && (live || run.status === 'closed') && (
          <div style={grid}>
            <Field text={t('perf.dist.kind')}>
              <select style={input} value={dist.kind} onChange={e => setDist({ ...dist, kind: e.target.value as DisturbanceKind })}>
                {DISTURBANCE_KINDS.map(k => <option key={k} value={k}>{t(`perf.distKind.${k}`)}</option>)}
              </select>
            </Field>
            <Field text={t('perf.dist.start')} required><input type="datetime-local" style={input} value={dist.startedAt} onChange={e => setDist({ ...dist, startedAt: e.target.value })} /></Field>
            <Field text={t('perf.dist.endOptional')}><input type="datetime-local" style={input} value={dist.endedAt} onChange={e => setDist({ ...dist, endedAt: e.target.value })} /></Field>
            <Field text={t('perf.dist.description')} wide required><input style={input} value={dist.description} maxLength={2000} onChange={e => setDist({ ...dist, description: e.target.value })} /></Field>
            <div>
              <button type="button" style={btn('outline', isPending || !dist.startedAt || dist.description.trim().length < 3)} disabled={isPending || !dist.startedAt || dist.description.trim().length < 3}
                onClick={() => act(() => recordPerformanceDisturbance({ ...ids, kind: dist.kind, description: dist.description, startedAt: inWindow(dist.startedAt)!, endedAt: localToIso(dist.endedAt) }),
                  () => setDist({ kind: 'load_change', description: '', startedAt: '', endedAt: '' }))}>+ {t('perf.dist.add')}</button>
            </div>
          </div>
        )}
      </section>

      {/* Lecturas manuales */}
      {manualVars.length > 0 && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={sectionTitle}>{t('perf.manualReadings')}</h2>
          {member && live && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field text={t('perf.crit.variable')}>
                <select style={{ ...input, width: 220 }} value={reading.variableId} onChange={e => setReading({ ...reading, variableId: e.target.value })}>
                  {manualVars.map(v => <option key={v.id} value={v.id}>{v.key} · {v.label}</option>)}
                </select>
              </Field>
              <Field text={t('perf.readingTime')}><input type="datetime-local" style={{ ...input, width: 210 }} value={reading.at} onChange={e => setReading({ ...reading, at: e.target.value })} /></Field>
              <Field text={t('perf.value')}><input inputMode="decimal" style={{ ...input, width: 140 }} value={reading.value} onChange={e => setReading({ ...reading, value: e.target.value })} /></Field>
              <button type="button" style={btn('outline', isPending || !reading.value.trim())} disabled={isPending || !reading.value.trim()}
                onClick={() => act(() => addPerformanceManualReading({ ...ids, variableId: reading.variableId, at: inWindow(reading.at) ?? new Date().toISOString(), value: reading.value }),
                  () => setReading({ ...reading, at: '', value: '' }))}>+ {t('perf.addReading')}</button>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['time', 'variable', 'value', 'by', ''].map(c => <th key={c} style={th}>{c ? t(`perf.reading.${c}`) : ''}</th>)}</tr></thead>
            <tbody>
              {manualPoints.map(p => {
                const v = varById.get(p.variableId)
                return (
                  <tr key={`${p.variableId}:${p.bucket}`}>
                    <td style={td} suppressHydrationWarning>{when(p.bucket)}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{v?.key}</td>
                    <td style={td}>{p.value?.toLocaleString(undefined, { maximumFractionDigits: 4 })}{v?.unit ? ` ${v.unit}` : ''}</td>
                    <td style={td}>{who(p.enteredBy)}</td>
                    <td style={td}>{live && (p.enteredBy === userId || lead) && (
                      <button type="button" aria-label={t('perf.remove')} style={{ ...btn('outline'), padding: '2px 8px' }} disabled={isPending}
                        onClick={() => act(() => deletePerformanceManualReading({ ...ids, variableId: p.variableId, bucket: p.bucket }))}>×</button>
                    )}</td>
                  </tr>
                )
              })}
              {manualPoints.length === 0 && <tr><td colSpan={5} style={{ ...td, ...small, textAlign: 'center' }}>{t('perf.noReadings')}</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
