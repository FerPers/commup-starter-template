import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CATEGORY_CFG } from '@/components/dashboard/widgets/_shared'
import type { PunchSummary } from '@/lib/list/punch-query'
import { ink } from '@/lib/theme'

/**
 * N1 (decisión de Luis 2026-10-21): el cliente entra al punch list por un resumen por categoría
 * (A/B/C abiertos) y elige una para ver el detalle (`?cat=`). «Ver todos» abre la lista completa.
 */
export default async function ClientPunchSummary({ projectId, projectName, summary }: { projectId: string; projectName: string; summary: PunchSummary }) {
  const t = await getTranslations('PunchList')
  const base = `/projects/${projectId}/punches`
  const cards = [
    { cat: 'A' as const, n: summary.catAOpen },
    { cat: 'B' as const, n: summary.catBOpen },
    { cat: 'C' as const, n: summary.catCOpen },
  ]
  return (
    <div style={{ padding: 28, maxWidth: 980 }}>
      <Link href={`/projects/${projectId}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textDecoration: 'none' }}>{t('backLink', { projectName })}</Link>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-strong)', margin: '6px 0 4px' }}>{t('title')}</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{t('clientSummary.intro')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {cards.map(({ cat, n }) => {
          const cfg = CATEGORY_CFG[cat]
          return (
            <Link key={cat} href={`${base}?cat=${cat}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--card-bg)', border: `1px solid ${cfg.border}`, borderTop: `4px solid ${cfg.color}`, borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: ink(cfg.color) }}>{t(`catLabels.${cat}`)}</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: n > 0 ? 'var(--text-strong)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', margin: '6px 0 2px' }}>{n}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('clientSummary.open')}</div>
                <div style={{ marginTop: 10, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-700)' }}>{t('clientSummary.seeDetail')}</div>
              </div>
            </Link>
          )
        })}
      </div>
      <p style={{ marginTop: 18, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        {t('clientSummary.closed', { n: summary.closed, total: summary.total })}{' · '}
        <Link href={`${base}?view=list`} style={{ color: 'var(--primary-700)', fontWeight: 600, textDecoration: 'none' }}>{t('clientSummary.seeAll')}</Link>
      </p>
    </div>
  )
}
