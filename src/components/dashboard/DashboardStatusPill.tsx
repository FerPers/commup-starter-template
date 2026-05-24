'use client'

import { useTranslations } from 'next-intl'
import { useMounted } from '@/hooks/useMounted'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export default function DashboardStatusPill() {
  const t = useTranslations('Pwa.sync')
  const mounted = useMounted()
  const { isOnline, pendingCount } = useOfflineSync()

  const state = !mounted
    ? 'loading'
    : isOnline
      ? pendingCount > 0 ? 'syncing' : 'online'
      : 'offline'

  const label = !mounted
    ? t('loading')
    : isOnline
      ? pendingCount > 0 ? t('syncing', { count: pendingCount }) : t('online')
      : t('offlinePending', { count: pendingCount })

  return (
    <div className="status-pill" data-state={state} aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
