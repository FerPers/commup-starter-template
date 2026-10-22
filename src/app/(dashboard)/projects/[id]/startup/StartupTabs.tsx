'use client'

import { useTranslations } from 'next-intl'
import HubTabs from '@/components/navigation/HubTabs'
import { STARTUP_TABS, startupTabHref, type StartupHubTab } from '@/lib/navigation/hub-routes'
import { small } from '../daily/daily-ui'

// H-18: cabecera del hub Arranque con pestañas por ruta (`HubTabs`): procedimientos = raíz, line-ups, bitácora,
// operación y desempeño con ruta propia. El h1 es «Arranque»; cada pestaña explica lo suyo en el subtítulo.
export default function StartupTabs({ projectId, active, subtitle, actions }: {
  projectId: string
  active: StartupHubTab
  subtitle?: string
  actions?: React.ReactNode
}) {
  const t = useTranslations('Startup')
  return (
    <div>
      <HubTabs
        title={t('title')}
        current={active}
        aside={actions}
        tabs={STARTUP_TABS.map(k => ({ key: k, href: startupTabHref(projectId, k), label: t(`tab.${k}`) }))}
      />
      {subtitle && <p style={{ ...small, margin: '-8px 0 0', maxWidth: 780 }}>{subtitle}</p>}
    </div>
  )
}
