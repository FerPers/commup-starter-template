import { dailyTabHref } from '@/lib/navigation/hub-routes'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'
import { loadPortfolioReadiness } from '@/lib/readiness/portfolio-server'
import { TONE_STYLE } from '@/lib/states'

/**
 * N2b (D-38) + V1 (Portafolio unificado, decisión de Luis 2026-10-22): la tabla de liberación por proyecto vive aquí,
 * en el Portafolio (/dashboard); /control-tower solo redirige. Por proyecto: liberaciones aprobadas vigentes, avance
 * físico, sistemas que no avanzan, por aprobar y por firmar, restricciones en N4 y compromisos que vencen. Todos los
 * proyectos, ordenados por riesgo; los que aún no tienen sistemas, al final.
 */
export default async function ReadinessWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const [t, all] = await Promise.all([getTranslations('Dashboard'), loadPortfolioReadiness(supabase, orgId)])
  const risk = (p: (typeof all)[number]) => p.counts.regressed + p.counts.blocked
  const projects = [...all].sort((a, b) => Number(a.systems === 0) - Number(b.systems === 0) || risk(b) - risk(a) || a.code.localeCompare(b.code))

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600 }
  const n = (v: number, color: string) => <span style={{ color: v > 0 ? color : 'var(--text-muted)' }}>{v}</span>

  return (
    <Card padding="md">
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{t('readiness.title')}</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t('readiness.subtitle')}</p>
      </div>
      {projects.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{t('readiness.empty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table aria-label={t('readiness.title')} style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th style={{ ...th, textAlign: 'left', minWidth: 180 }}>{t('readiness.col.project')}</th>
                <th style={th}>{t('readiness.col.readiness')}</th>
                <th style={th}>{t('readiness.col.physical')}</th>
                <th style={th}>{t('readiness.col.blocked')}</th>
                <th style={th}>{t('readiness.col.toApprove')}</th>
                <th style={th}>{t('readiness.col.toSign')}</th>
                <th style={th}>{t('readiness.col.n4')}</th>
                <th style={th}>{t('readiness.col.due')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.clientLogoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- E2: logo del cliente (bucket público), tamaño fijo
                        <img src={p.clientLogoUrl} alt={t('readiness.clientLogo', { client: p.client ?? p.code })} style={{ width: 40, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/projects/${p.id}`} style={{ color: 'var(--text-strong)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{p.code}</Link>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{p.client ? `${p.name} · ${p.client}` : p.name}</div>
                      </div>
                    </div>
                  </td>
                  {p.systems === 0 ? (
                    <td colSpan={7} style={{ ...td, textAlign: 'left', fontWeight: 400, color: 'var(--text-muted)' }}>{t('readiness.noSystems')}</td>
                  ) : (
                    <>
                      <td style={td}>
                        <Link href={`/projects/${p.id}/readiness`} style={{ color: 'var(--text-strong)', textDecoration: 'none' }}>{p.readiness.done}/{p.readiness.total}</Link>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{(p.readiness.pct * 100).toFixed(0)} %</div>
                      </td>
                      <td style={td}>{(p.weighted * 100).toFixed(1)} %</td>
                      <td style={td}><Link href={`/projects/${p.id}/readiness?blocked=1`} style={{ textDecoration: 'none' }}>{n(p.counts.regressed + p.counts.blocked, 'var(--danger-700)')}</Link></td>
                      <td style={td}><Link href={`/projects/${p.id}/readiness?state=ready`} style={{ textDecoration: 'none' }}>{n(p.counts.ready, TONE_STYLE.wait.fg)}</Link></td>
                      <td style={td}><Link href={`/projects/${p.id}/readiness?state=signing`} style={{ textDecoration: 'none' }}>{n(p.counts.signing, TONE_STYLE.wait.fg)}</Link></td>
                      <td style={td}><Link href={dailyTabHref(p.id, 'constraints')} style={{ textDecoration: 'none' }}>{n(p.constraintsN4, 'var(--danger-700)')}</Link></td>
                      <td style={td}><Link href={`/projects/${p.id}/readiness?committed=7`} style={{ textDecoration: 'none' }}>{n(p.commitmentsSoon, 'var(--warning-700)')}</Link></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
