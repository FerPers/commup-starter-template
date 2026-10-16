'use client'

import { useCallback, useEffect, useMemo, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DrawerContext } from './DrawerContext'
import { useToast } from '@/components/ui'
import { STARTUP_SYNC_ISSUE_EVENT, SYNC_DROPPED_EVENT, type SyncDroppedDetail } from '@/lib/offline-queue'

interface DashboardShellProps {
  sidebar: ReactNode
  topbar: ReactNode
  /** Barra inferior móvil (roles de campo). Null = sin barra. */
  tabbar?: ReactNode
  children: ReactNode
}

export default function DashboardShell({ sidebar, topbar, tabbar = null, children }: DashboardShellProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const toast = useToast()
  const tSync = useTranslations('Pwa.sync')

  // Sprint O: aviso global cuando el replay descarta una entrada de la bandeja de salida.
  useEffect(() => {
    const onDropped = (e: Event) => {
      const d = (e as CustomEvent<SyncDroppedDetail>).detail
      if (!d) return
      toast.error(tSync('dropped', { kind: tSync(`kind.${d.kind}`), error: d.error }))
    }
    // Fase 6: registros de arranque rechazados o en conflicto (quedan en la bandeja de la ejecución/hoja).
    const onStartupIssue = (e: Event) => {
      const n = (e as CustomEvent<{ count: number }>).detail?.count ?? 0
      if (n > 0) toast.error(tSync('startupIssue', { n }))
    }
    window.addEventListener(SYNC_DROPPED_EVENT, onDropped)
    window.addEventListener(STARTUP_SYNC_ISSUE_EVENT, onStartupIssue)
    return () => {
      window.removeEventListener(SYNC_DROPPED_EVENT, onDropped)
      window.removeEventListener(STARTUP_SYNC_ISSUE_EVENT, onStartupIssue)
    }
  }, [toast, tSync])

  const close = useCallback(() => setIsOpen(false), [])
  const open = useCallback(() => setIsOpen(true), [])

  // Close drawer when route changes (user tapped a nav link).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical pattern: react to external nav change by resetting local UI state
    setIsOpen(false)
  }, [pathname])

  // ESC closes the drawer.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('drawer-locked')
    } else {
      document.body.classList.remove('drawer-locked')
    }
    return () => document.body.classList.remove('drawer-locked')
  }, [isOpen])

  const sidebarWithState = isValidElement(sidebar)
    ? cloneElement(sidebar as ReactElement<{ isOpen?: boolean }>, { isOpen })
    : sidebar

  const ctxValue = useMemo(() => ({ open }), [open])

  return (
    <DrawerContext.Provider value={ctxValue}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
        {sidebarWithState}
        <div
          className={`app-backdrop${isOpen ? ' is-open' : ''}`}
          aria-hidden="true"
          onClick={close}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {topbar}
          <main className={`app-main${tabbar ? ' has-tabbar' : ''}`} style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {children}
          </main>
        </div>
        {tabbar}
      </div>
    </DrawerContext.Provider>
  )
}