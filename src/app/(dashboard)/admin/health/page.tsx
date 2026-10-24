import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { fromJson } from '@/lib/supabase/casts'
import { formatInZone } from '@/lib/time/zone'

// A15: salud de la plataforma (crons y colas). Solo operadores (platform_operators); para el resto la página no
// existe. Los mismos chequeos los corre pg_cron `platform-health` cada 5 min y avisan a los operadores al pasar a rojo.
type Check = { key: string; area: 'cron_http' | 'pg_cron' | 'queue' | 'delivery'; label: string; status: 'ok' | 'warn' | 'fail'; code: string; minutes?: number | null; n?: number | null; message?: string | null }
type Health = { checked_at: string; checks: Check[]; state: Record<string, { status: string; since: string }> }

const AREAS: Check['area'][] = ['cron_http', 'pg_cron', 'queue', 'delivery']
const ZONE = 'America/Bogota'
const CHIP: Record<Check['status'], { bg: string; fg: string; border: string }> = {
  ok: { bg: 'var(--success-50)', fg: 'var(--success-700)', border: 'var(--success-200)' },
  warn: { bg: 'var(--warning-50)', fg: 'var(--warning-700)', border: 'var(--warning-200)' },
  fail: { bg: 'var(--danger-50)', fg: 'var(--danger-700)', border: 'var(--danger-200)' },
}
const ORDER: Record<Check['status'], number> = { fail: 0, warn: 1, ok: 2 }
const LABELED = new Set(['domain_events', 'notification_push_outbox', 'webhook_deliveries', 'handover_packages', 'sync_conflict_log'])

export default async function PlatformHealthPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const { data: operator } = await ctx.supabase.from('platform_operators').select('user_id').eq('user_id', ctx.userId).maybeSingle()
  if (!operator) notFound()
  const [{ data, error }, t, locale] = await Promise.all([ctx.supabase.rpc('platform_health'), getTranslations('PlatformHealth'), getLocale()])
  if (error || !data) throw new Error(error?.message ?? 'platform_health')
  const health = fromJson<Health>(data)
  const checks = health.checks
  const count = (s: Check['status']) => checks.filter(c => c.status === s).length
  const detail = (c: Check) => t(`code.${c.code}` as 'code.no_runs', { minutes: c.minutes ?? 0, n: c.n ?? 0, message: c.message ?? '' })
  const cell = { padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: '13px', verticalAlign: 'top' } as const

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1000px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '6px 0 4px' }}>{t('subtitle', { time: formatInZone(health.checked_at, ZONE, locale) })}</p>
      <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 20px', color: count('fail') ? 'var(--danger-700)' : count('warn') ? 'var(--warning-700)' : 'var(--success-700)' }}>
        {t('summary', { fail: count('fail'), warn: count('warn') })}
      </p>
      {AREAS.map(area => {
        const rows = checks.filter(c => c.area === area).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.label.localeCompare(b.label))
        if (!rows.length) return null
        return (
          <section key={area} style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t(`area.${area}`)}</h2>
            <div style={{ overflowX: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>{(['status', 'check', 'detail', 'since'] as const).map(c => (
                  <th key={c} style={{ ...cell, borderTop: 0, textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{t(`col.${c}`)}</th>
                ))}</tr></thead>
                <tbody>{rows.map(c => {
                  const since = health.state[c.key]?.since
                  return (
                    <tr key={c.key}>
                      <td style={cell}><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: CHIP[c.status].bg, color: CHIP[c.status].fg, border: `1px solid ${CHIP[c.status].border}` }}>{t(`status.${c.status}`)}</span></td>
                      <td style={{ ...cell, fontWeight: 600, color: 'var(--text-strong)' }}>{LABELED.has(c.label) ? t(`label.${c.label}` as 'label.domain_events') : <code>{c.label}</code>}</td>
                      <td style={{ ...cell, color: 'var(--text-body)' }}>{detail(c)}</td>
                      <td style={{ ...cell, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{since ? formatInZone(since, ZONE, locale) : t('never')}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
