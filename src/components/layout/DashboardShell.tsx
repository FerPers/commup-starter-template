'use client'

import { useCallback, useEffect, useMemo, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { DrawerContext } from './DrawerContext'

interface DashboardShellProps {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
}

export default function DashboardShell({ sidebar, topbar, children }: DashboardShellProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

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
          <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {children}
          </main>
        </div>
      </div>
    </DrawerContext.Provider>
  )
}