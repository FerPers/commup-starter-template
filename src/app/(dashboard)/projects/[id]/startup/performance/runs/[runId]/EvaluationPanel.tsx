'use client'

import Link from 'next/link'
import { useAskDialog } from '@/components/ui/AskDialog'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { acknowledgePerformanceExclusions, recordPerformanceResult } from '@/app/actions/performance'
import {
  OUTCOME_TONE, PERF_RESULTS, RESULT_TONE, criterionText, exclusionsPendingAck, needsResultReason,
  type Evaluation, type PerfResult,
} from '@/lib/performance/catalog'
import { Alert, Chip, Field, btn, card, input, label, small } from '../../../../daily/daily-ui'
import { useLocalTime } from '@/lib/use-local-time'

// Evaluación de un intento (fase 7, sesión 2): la calcula la BD (evaluate_performance_run); aquí solo se
// muestra y se registra el resultado. Una vez registrado, la evaluación queda congelada con hash.

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const sectionTitle: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }
const fmt = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }))

export default function EvaluationPanel({ projectId, run, evaluation, evaluationError, action, names, canLead, canAckExclusions = false, userId }: {
  projectId: string
  run: { id: string; status: string; result: PerfResult | null; result_reason: string | null; result_by: string | null; result_at: string | null; evaluation_hash: string | null }
  evaluation: Evaluation | null
  evaluationError: string | null
  action: { id: string; number: string; status: string } | null
  names: Record<string, string>
  canLead: boolean
  /** S25 (E-19): representante del cliente (capacidad client_rep). */
  canAckExclusions?: boolean
  userId?: string
}) {
  const t = useTranslations('Startup')
  // S25b (E-34): diálogos propios en vez de window.prompt / window.confirm.
  const { dialog, ask } = useAskDialog()
  const localTime = useLocalTime()  // S10 (E-15b)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PerfResult>(evaluation?.suggested ?? 'inconclusive')
  const [reason, setReason] = useState('')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'

  if (evaluationError) return <Alert kind="error">{evaluationError}</Alert>
  if (!evaluation) return null
  const e = evaluation
  const frozen = run.status === 'evaluated'
  const unitOf = (k: string) => e.variables.find(v => v.key === k)?.unit ?? null
  const reasonNeeded = needsResultReason(result, e.suggested)
  const pendingAck = !frozen && exclusionsPendingAck(e)
  const unacked = (e.exclusions ?? []).filter(x => !x.client_ack_by)
  const canAckNow = canAckExclusions && run.status === 'closed' && unacked.length > 0 && !unacked.some(x => x.excluded_by === userId)

  function record() {
    setError(null)
    startTransition(async () => {
      const res = await recordPerformanceResult({ projectId, runId: run.id, result, reason })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {dialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={sectionTitle}>{t('perf.eval.title')}</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={small}>{t('perf.eval.suggested')}</span>
          <Chip tone={RESULT_TONE[e.suggested]}>{t(`perf.result.${e.suggested}`)}</Chip>
          {frozen && run.result && <><span style={small}>· {t('perf.eval.recorded')}</span><Chip tone={RESULT_TONE[run.result]}>{t(`perf.result.${run.result}`)}</Chip></>}
        </div>
      </div>

      <p style={{ ...small, margin: 0 }}>
        {t('perf.eval.window', { valid: e.window.valid_min, total: e.window.total_min, excluded: e.window.excluded_min, cov: e.window.min_coverage_pct })}
      </p>
      {e.reasons.length > 0 && (
        <Alert kind="warn">{t('perf.eval.reasonsLead')} {e.reasons.map(r => t(`perf.reason.${r}`)).join(' · ')}</Alert>
      )}

      {/* S25 (E-19): qué cambian las exclusiones; el cliente las reconoce si cambian el sugerido */}
      {e.without_exclusions && (
        <div style={{ border: `1px solid ${e.exclusions_change_result ? '#fde68a' : 'var(--border)'}`, background: e.exclusions_change_result ? '#fffbeb' : undefined, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...small, fontWeight: 700 }}>{t('perf.excl.withoutTitle')}</span>
            <Chip tone={RESULT_TONE[e.without_exclusions.suggested]}>{t(`perf.result.${e.without_exclusions.suggested}`)}</Chip>
            <span style={small}>· {t('perf.excl.withTitle')}</span>
            <Chip tone={RESULT_TONE[e.suggested]}>{t(`perf.result.${e.suggested}`)}</Chip>
          </div>
          <ul style={{ ...small, margin: 0, paddingLeft: 18 }}>
            {(e.exclusions ?? []).map(x => (
              <li key={x.id}>
                {localTime(x.started_at)} → {x.ended_at ? localTime(x.ended_at) : '…'} · {t(`perf.distKind.${x.kind}`)} · {x.reason ?? ''} ({who(x.excluded_by)})
                {' — '}{x.client_ack_by ? t('perf.excl.acked', { who: who(x.client_ack_by), when: localTime(x.client_ack_at) }) : t('perf.excl.notAcked')}
              </li>
            ))}
          </ul>
          {pendingAck && <span style={{ ...small, color: '#b45309', fontWeight: 600 }}>{t('perf.excl.needsAck')}</span>}
          {canAckNow && (
            <div>
              <button type="button" style={btn('primary', isPending)} disabled={isPending}
                onClick={() => {
                  setError(null)
                  startTransition(async () => {
                    const res = await acknowledgePerformanceExclusions({ projectId, runId: run.id })
                    if (res.error) setError(res.error); else router.refresh()
                  })
                }}>{t('perf.excl.ack')}</button>
            </div>
          )}
        </div>
      )}

      {/* Criterios */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ ...label, marginBottom: 6 }}>{t('perf.criteria')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr>{['criterion', 'value', 'outcome'].map(c => <th key={c} style={th}>{t(`perf.eval.col.${c}`)}</th>)}</tr></thead>
          <tbody>
            {e.criteria.map(c => (
              <tr key={c.ord}>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>
                  {criterionText({
                    variable_key: c.variable_key, statistic: c.statistic, band_lo: c.band_lo === null ? '' : String(c.band_lo), band_hi: c.band_hi === null ? '' : String(c.band_hi),
                    total_basis: c.total_basis ?? 'h', operator: c.operator, target: String(c.target), target_hi: c.target_hi === null ? '' : String(c.target_hi),
                    uncertainty: String(c.uncertainty), uncertainty_mode: c.uncertainty_mode,
                  }, unitOf(c.variable_key))}
                  {c.label && <div style={{ ...small, fontFamily: 'inherit' }}>{c.label}</div>}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{fmt(c.value)}{c.value === null ? '' : c.statistic === 'pct_in_band' ? ' %' : unitOf(c.variable_key) ? ` ${unitOf(c.variable_key)}` : ''}
                  {c.statistic === 'total' && c.value_extrapolated != null && (
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{t('perf.eval.extrapolated', { value: fmt(c.value_extrapolated) })}</div>
                  )}
                </td>
                <td style={td}><Chip tone={OUTCOME_TONE[c.outcome]}>{t(`perf.outcome.${c.outcome}`)}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Validación de datos */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ ...label, marginBottom: 6 }}>{t('perf.eval.validation')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>{['variable', 'coverage', 'quality', 'spikes', 'unit', 'state'].map(c => <th key={c} style={th}>{t(`perf.eval.vcol.${c}`)}</th>)}</tr></thead>
          <tbody>
            {e.variables.map(v => (
              <tr key={v.key}>
                <td style={td}><span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{v.key}</span> <span style={small}>{v.signal ?? v.formula ?? t(`perf.source.${v.source}`)}</span></td>
                <td style={{ ...td, color: v.coverage_ok === false ? 'var(--danger-700)' : undefined }}>
                  {fmt(v.coverage_pct, 1)} %{v.expected !== undefined && <span style={small}> ({v.present}/{fmt(v.expected, 1)})</span>}
                </td>
                <td style={td}>{v.bad_pct === undefined ? '—' : `${fmt(v.bad_pct, 1)} %`}</td>
                <td style={td}>{v.spikes === undefined ? '—' : `${v.spikes}${v.out_of_range ? ` · ${t('perf.eval.oor', { n: v.out_of_range })}` : ''}`}</td>
                <td style={td}>{v.unit_ok === false ? <Chip tone="red">{t('perf.eval.unitBad')}</Chip> : (v.unit ?? '—')}</td>
                <td style={td}><Chip tone={v.evaluable ? 'green' : 'red'}>{t(v.evaluable ? 'perf.eval.evaluable' : 'perf.eval.notEvaluable')}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {e.pairs.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: 6 }}>{t('perf.pairs')}</div>
          {e.pairs.map(p => (
            <div key={`${p.variable_a}-${p.variable_b}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{p.variable_a} ↔ {p.variable_b}</span>
              <span>{t('perf.eval.pairDiff', { diff: fmt(p.diff_pct, 2), max: p.max_diff_pct, n: p.minutes })}</span>
              <Chip tone={p.ok ? 'green' : 'red'}>{t(p.ok ? 'perf.eval.pairOk' : 'perf.eval.pairBad')}</Chip>
            </div>
          ))}
        </div>
      )}

      {/* Resultado */}
      {frozen ? (
        <div style={{ ...small, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{t('perf.eval.recordedBy', { who: who(run.result_by), when: localTime(run.result_at) })}</span>
          {run.result_reason && <span>{t('perf.eval.reason')}: {run.result_reason}</span>}
          {action && <span>{t('perf.eval.action')}: <Link href={`/projects/${projectId}/daily/action/${action.id}`} style={{ color: 'var(--primary-600, #2563eb)' }}>{action.number}</Link></span>}
          {run.evaluation_hash && <span style={{ fontFamily: 'ui-monospace, monospace' }}>sha256 {run.evaluation_hash.slice(0, 16)}…</span>}
        </div>
      ) : canLead ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field text={t('perf.eval.result')}>
            <select style={{ ...input, width: 240 }} value={result} onChange={ev => setResult(ev.target.value as PerfResult)}>
              {PERF_RESULTS.map(r => <option key={r} value={r}>{t(`perf.result.${r}`)}{r === e.suggested ? ` · ${t('perf.eval.suggestedShort')}` : ''}</option>)}
            </select>
          </Field>
          <Field text={reasonNeeded ? t('perf.eval.reasonRequired') : t('perf.eval.reasonOptional')}>
            <input style={{ ...input, width: 360 }} value={reason} maxLength={2000} onChange={ev => setReason(ev.target.value)} />
          </Field>
          <button type="button" style={btn('primary', isPending || pendingAck || (reasonNeeded && reason.trim().length < 3))} disabled={isPending || pendingAck || (reasonNeeded && reason.trim().length < 3)}
            onClick={async () => { if ((await ask({ title: t('perf.eval.record'), message: t('perf.eval.confirm'), confirmLabel: t('perf.eval.record') })) !== null) record() }}>{t('perf.eval.record')}</button>
          {(result === 'failed' || result === 'accepted_with_deviation') && <span style={small}>{t('perf.eval.actionHint')}</span>}
        </div>
      ) : (
        <span style={small}>{t('perf.eval.leadOnly')}</span>
      )}
      {error && <Alert kind="error">{error}</Alert>}
    </section>
  )
}
