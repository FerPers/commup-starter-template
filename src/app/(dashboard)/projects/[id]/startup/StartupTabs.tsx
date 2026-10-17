'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

// Pestañas del hub Arranque para las páginas con ruta propia (procedimientos y line-ups viven en ?tab=).
const TABS = ['procedures', 'lineups', 'events', 'operations', 'performance'] as const
type StartupTab = (typeof TABS)[number]

const href = (root: string, k: StartupTab) => (k === 'procedures' ? root : k === 'lineups' ? `${root}?tab=lineups` : `${root}/${k}`)

export default function StartupTabs({ projectId, active }: { projectId: string; active: StartupTab }) {
  const t = useTranslations('Startup')
  const root = `/projects/${projectId}/startup`
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
      {TABS.map(k => k === active
        ? <span key={k} aria-current="page" style={{ padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-600, #2563eb)', borderBottom: '2px solid var(--primary-500)', marginBottom: -1, whiteSpace: 'nowrap' }}>{t(`tab.${k}`)}</span>
        : <Link key={k} href={href(root, k)} style={{ padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{t(`tab.${k}`)}</Link>)}
    </div>
  )
}
