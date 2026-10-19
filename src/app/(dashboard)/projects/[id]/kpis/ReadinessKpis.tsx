'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// KPIs de readiness y gestión diaria (fase 5, sesión 2; libro 7.23/7.26): curva S del avance físico
// ponderado por gate (snapshots diarios) y los KPIs calculables hoy. Primer arranque y falla repetida
// (bitácora F6 + pruebas de desempeño F7) desde la fase 7; completitud documental y vendors llegan con la fase 8.

export type MgmtSnapshot = {
  snapshot_date: string
  weighted_pct: number
  gates_approved: number
  gates_total: number
  kpis: {
    tq?: { open: number; overdue: number; closed_30d: number; answered_30d: number; on_time_30d: number; with_due_30d: number; avg_days_to_answer_30d: number | null }
    actions?: { open: number; overdue: number; to_verify: number; verified_30d: number; on_time_30d: number; with_due_30d: number }
    constraints?: { open: number; overdue: number; by_level: Record<string, number>; avg_age_days: number | null; closed_30d: number }
    commitments?: { approved_30d: number; on_time_30d: number }
    startup?: { started: number; successful: number; failed: number; pending: number }
    trips?: { events_30d: number; systems_30d: number; repeat_systems_30d: number }
    performance?: { tests: number; accepted: number; accepted_first: number; failed_runs: number }
  }
}

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const label: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }
const sub: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }
const rate = (ok: number, of: number) => (of > 0 ? `${Math.round((ok / of) * 100)} %` : '—')

export default function ReadinessKpis({ projectId, livePct, liveGates, snapshots }: {
  projectId: string
  livePct: number
  liveGates: { approved: number; total: number }
  snapshots: MgmtSnapshot[]
}) {
  const t = useTranslations('Kpis.readiness')
  const last = snapshots.at(-1)
  const k = last?.kpis ?? {}
  const data = snapshots.map(s => ({ date: s.snapshot_date.slice(5), pct: Number((s.weighted_pct * 100).toFixed(1)) }))
  const lv = k.constraints?.by_level ?? {}
  const su = k.startup
  const suDone = (su?.successful ?? 0) + (su?.failed ?? 0)

  const tiles = [
    { title: t('weighted'), value: `${(livePct * 100).toFixed(1)} %`, hint: t('weightedHint') },
    { title: t('readiness'), value: `${liveGates.approved}/${liveGates.total}`, hint: t('readinessHint') },
    { title: t('commitments'), value: rate(k.commitments?.on_time_30d ?? 0, k.commitments?.approved_30d ?? 0), hint: t('commitmentsHint', { n: k.commitments?.approved_30d ?? 0 }) },
    { title: t('tq'), value: rate(k.tq?.on_time_30d ?? 0, k.tq?.with_due_30d ?? 0),
      hint: t('tqHint', { closed: k.tq?.closed_30d ?? 0, days: k.tq?.avg_days_to_answer_30d ?? '—', open: k.tq?.open ?? 0 }) },
    { title: t('actions'), value: rate(k.actions?.on_time_30d ?? 0, k.actions?.with_due_30d ?? 0),
      hint: t('actionsHint', { open: k.actions?.open ?? 0, overdue: k.actions?.overdue ?? 0, verify: k.actions?.to_verify ?? 0 }), red: (k.actions?.overdue ?? 0) > 0 },
    { title: t('constraints'), value: String(k.constraints?.open ?? 0),
      hint: t('constraintsHint', { l1: lv['1'] ?? 0, l2: lv['2'] ?? 0, l3: lv['3'] ?? 0, l4: lv['4'] ?? 0, age: k.constraints?.avg_age_days ?? '—' }), red: (lv['4'] ?? 0) > 0 },
    { title: t('startup'), value: rate(su?.successful ?? 0, suDone),
      hint: t('startupHint', { ok: su?.successful ?? 0, done: suDone, pending: su?.pending ?? 0 }), red: (su?.failed ?? 0) > 0 },
    { title: t('trips'), value: String(k.trips?.repeat_systems_30d ?? 0),
      hint: t('tripsHint', { events: k.trips?.events_30d ?? 0, systems: k.trips?.systems_30d ?? 0 }), red: (k.trips?.repeat_systems_30d ?? 0) > 0 },
    { title: t('performance'), value: rate(k.performance?.accepted_first ?? 0, k.performance?.accepted ?? 0),
      hint: t('performanceHint', { first: k.performance?.accepted_first ?? 0, accepted: k.performance?.accepted ?? 0,
        tests: k.performance?.tests ?? 0, failed: k.performance?.failed_runs ?? 0 }) },
  ]

  return (
    <section style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="readiness-kpis">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="readiness-kpis" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h2>
        <Link href={`/projects/${projectId}/daily/lookahead`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>{t('lookahead')}</Link>
      </div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
        {last ? t('asOf', { date: last.snapshot_date }) : t('noSnapshot')} {t('later')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {tiles.map(x => (
          <div key={x.title} style={card}>
            <div style={label}>{x.title}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: x.red ? 'var(--danger-700)' : 'var(--text-strong)' }}>{x.value}</div>
            <div style={sub}>{x.hint}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 16 }}>
        <div style={{ ...label, marginBottom: 10 }}>{t('curve')}</div>
        {data.length < 2 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{t('curveEmpty')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 5, right: 24, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={v => [`${String(v)} %`, t('weighted')]} />
              <Line type="monotone" dataKey="pct" stroke="var(--primary-500, #2563eb)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
