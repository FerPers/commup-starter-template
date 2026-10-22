'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setGateCommitment, setGateForecast } from '@/app/actions/planning'
import { gateGap } from '@/lib/readiness/planning'

// Planificación del gate (fase 5, sesión 2): avance físico ponderado de la fase del gate, forecast
// (cualquier no-client) y compromiso (líderes+; el cambio pide motivo), con el historial de fechas.

export type GateProgress = { weight: number; itr_total: number; itr_approved: number; pct: number }
export type GatePlan = { forecast_date: string | null; commitment_date: string | null }
export type GatePlanEvent = { id: string; kind: 'forecast' | 'commitment'; from_date: string | null; to_date: string | null; reason: string | null; user_id: string | null; created_at: string }

const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const inputStyle: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)',
  background: 'var(--card-bg)', color: 'var(--text-strong)',
}
const btn = (primary: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 8, fontSize: 'var(--text-xs)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-500)' : 'transparent', color: primary ? '#fff' : 'var(--text-strong)',
})

export default function GatePlanPanel({ projectId, systemId, gateId, progress, plan, events, names, canEdit, canCommit, settled }: {
  projectId: string; systemId: string; gateId: string
  progress: GateProgress | undefined; plan: GatePlan | undefined; events: GatePlanEvent[]; names: Record<string, string>
  canEdit: boolean; canCommit: boolean; settled: boolean
}) {
  const t = useTranslations('Gates')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [forecast, setForecast] = useState(plan?.forecast_date ?? '')
  const [commitment, setCommitment] = useState(plan?.commitment_date ?? '')
  const [reason, setReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const forecastDirty = (forecast || null) !== (plan?.forecast_date ?? null)
  const commitDirty = (commitment || null) !== (plan?.commitment_date ?? null)
  const needsReason = commitDirty && !!plan?.commitment_date
  const gap = gateGap(plan?.forecast_date, plan?.commitment_date)
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('unknownUser')

  function save() {
    setError(null)
    startTransition(async () => {
      const base = { projectId, systemId, gateId }
      if (forecastDirty) {
        const r = await setGateForecast({ ...base, date: forecast || null })
        if (r.error) { setError(r.error); return }
      }
      if (commitDirty) {
        const r = await setGateCommitment({ ...base, date: commitment || null, reason })
        if (r.error) { setError(r.error); return }
      }
      setReason('')
      router.refresh()
    })
  }

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', ...small }}>
        <span>
          <strong style={{ color: 'var(--text-strong)' }}>{t('plan.progress')}:</strong>{' '}
          {progress
            ? (progress.itr_total > 0
              ? t('plan.progressValue', { pct: (progress.pct * 100).toFixed(1), approved: progress.itr_approved, total: progress.itr_total })
              : t('plan.noItrs'))
            : '—'}
        </span>
        {progress && <span>{t('plan.weight', { pct: (progress.weight * 100).toFixed(0) })}</span>}
        {gap != null && gap !== 0 && (
          <strong style={{ color: gap > 0 ? 'var(--danger-700)' : 'var(--success-700)' }}>{t('plan.gap', { n: gap > 0 ? `+${gap}` : String(gap) })}</strong>
        )}
      </div>

      {settled ? (
        <div style={small}>
          {t('plan.forecast')}: {plan?.forecast_date ?? '—'} · {t('plan.commitment')}: {plan?.commitment_date ?? '—'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {t('plan.forecast')}
            <input type="date" style={inputStyle} value={forecast} disabled={!canEdit || isPending} onChange={e => setForecast(e.target.value)} />
          </label>
          <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {t('plan.commitment')}
            <input type="date" style={inputStyle} value={commitment} disabled={!canCommit || isPending} onChange={e => setCommitment(e.target.value)} />
          </label>
          {needsReason && (
            <input aria-label={t('plan.reason')} placeholder={t('plan.reason')} style={{ ...inputStyle, minWidth: 240 }} value={reason} onChange={e => setReason(e.target.value)} />
          )}
          {(forecastDirty || commitDirty) && (
            <button type="button" style={btn(true, isPending || (needsReason && reason.trim().length < 3))}
              disabled={isPending || (needsReason && reason.trim().length < 3)} onClick={save}>{t('plan.save')}</button>
          )}
        </div>
      )}
      {error && <div role="alert" style={{ ...small, color: 'var(--danger-700)' }}>{error}</div>}

      {events.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--primary-600, #2563eb)' }}>
            {showHistory ? t('plan.hideHistory') : t('plan.showHistory', { n: events.length })}
          </button>
          {showHistory && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, ...small, fontSize: 'var(--text-xs)' }}>
              {[...events].reverse().map(e => (
                <li key={e.id} suppressHydrationWarning>
                  {new Date(e.created_at).toLocaleString()} · <strong>{t(`plan.${e.kind}`)}</strong> {e.from_date ?? '—'} → {e.to_date ?? '—'} · {who(e.user_id)}
                  {e.reason && <em> — {e.reason}</em>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
