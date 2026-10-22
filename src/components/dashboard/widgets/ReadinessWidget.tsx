import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'
import { loadPortfolioReadiness } from '@/lib/readiness/portfolio-server'

/**
 * N2b (D-38): el gerente ya no aterriza solo en métricas de completions. Por proyecto: readiness (gates aprobados
 * vigentes), sistemas que no avanzan, gates por aprobar y por firmar, restricciones en N4 y compromisos que vencen.
 * Ordenado por riesgo; «Ver todos» abre el portafolio (/control-tower).
 */
export default async function ReadinessWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const [t, all] = await Promise.all([getTranslations('Dashboard'), loadPortfolioReadiness(supabase, orgId, 50)])
  const projects = all
    .filter(p => p.systems > 0)
    .sort((a, b) => (b.counts.regressed + b.counts.blocked) - (a.counts.regressed + a.counts.blocked) || a.code.localeCompare(b.code))
  const shown = projects.slice(0, 6)

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600 }
  const n = (v: number, color: string) => <span style={{ color: v > 0 ? color : 'var(--gray-400)' }}>{v}</span>

  return (
    <Card padding="md">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{t('readiness.title')}</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('readiness.subtitle')}</p>
        </div>
        <Link href="/control-tower" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-600)', textDecoration: 'none' }}>{t('readiness.viewAll')}</Link>
      </div>
      {shown.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{t('readiness.empty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th style={{ ...th, textAlign: 'left' }}>{t('readiness.col.project')}</th>
                <th style={th}>{t('readiness.col.readiness')}</th>
                <th style={th}>{t('readiness.col.blocked')}</th>
                <th style={th}>{t('readiness.col.toApprove')}</th>
                <th style={th}>{t('readiness.col.toSign')}</th>
                <th style={th}>{t('readiness.col.n4')}</th>
                <th style={th}>{t('readiness.col.due')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <Link href={`/projects/${p.id}`} style={{ color: 'var(--text-strong)', textDecoration: 'none' }}>{p.code}</Link>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{p.name}</div>
                  </td>
                  <td style={td}>
                    <Link href={`/projects/${p.id}/readiness`} style={{ color: 'var(--text-strong)', textDecoration: 'none' }}>{p.readiness.done}/{p.readiness.total}</Link>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{(p.readiness.pct * 100).toFixed(0)} %</div>
                  </td>
                  <td style={td}><Link href={`/projects/${p.id}/readiness?blocked=1`} style={{ textDecoration: 'none' }}>{n(p.counts.regressed + p.counts.blocked, 'var(--danger-700)')}</Link></td>
                  <td style={td}><Link href={`/projects/${p.id}/readiness?state=ready`} style={{ textDecoration: 'none' }}>{n(p.counts.ready, 'var(--success-700)')}</Link></td>
                  <td style={td}><Link href={`/projects/${p.id}/readiness?state=signing`} style={{ textDecoration: 'none' }}>{n(p.counts.signing, '#1d4ed8')}</Link></td>
                  <td style={td}><Link href={`/projects/${p.id}/daily?tab=constraints`} style={{ textDecoration: 'none' }}>{n(p.constraintsN4, 'var(--danger-700)')}</Link></td>
                  <td style={td}><Link href={`/projects/${p.id}/readiness?committed=7`} style={{ textDecoration: 'none' }}>{n(p.commitmentsSoon, '#b45309')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {projects.length > shown.length && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '10px 0 0' }}>{t('readiness.more', { count: projects.length - shown.length })}</p>
      )}
    </Card>
  )
}
