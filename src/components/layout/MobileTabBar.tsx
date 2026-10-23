'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ListChecks, ScanLine, Plus, Menu, type LucideIcon } from 'lucide-react'
import { CreateSheet, type CreateProject } from './CreateMenu'
import { useDrawerControls } from './DrawerContext'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useMounted } from '@/hooks/useMounted'

/**
 * Barra inferior móvil (2026-09-07) para roles de campo (inspector, leader).
 * Solo se ve por debajo de 1024px (ver `.app-tabbar` en globals.css); el layout
 * decide si se renderiza según el rol (FIELD_ROLES). Mostrar/ocultar aquí es UX:
 * la seguridad real vive en cada page.tsx.
 *
 * Ítems: Mi trabajo (badge de pendientes) · Escanear · ＋ Crear (N3b: reemplaza a Bandeja; la campana sigue arriba) ·
 * Menú (abre el drawer).
 */

interface MobileTabBarProps {
  counts: { myWork: number }
  role: string
  projects: CreateProject[]
}

type TabItem = {
  href: string
  labelKey: 'myWork' | 'scan'
  Icon: LucideIcon
  badge?: number
}

export default function MobileTabBar({ counts, role, projects }: MobileTabBarProps) {
  const t = useTranslations('MobileTabBar')
  const pathname = usePathname()
  const { open } = useDrawerControls()
  const [creating, setCreating] = useState(false)
  // Sprint O: punto ámbar (cola pendiente) o rojo (sin red) sobre «Menú».
  const mounted = useMounted()
  const { isOnline, pendingCount } = useOfflineSync()
  const syncBadge = mounted && (!isOnline || pendingCount > 0)
    ? { color: isOnline ? 'var(--warning-700)' : 'var(--danger-700)', label: isOnline ? t('syncPending', { count: pendingCount }) : t('offline', { count: pendingCount }) }
    : null

  const items: TabItem[] = [
    { href: '/my-work', labelKey: 'myWork', Icon: ListChecks, badge: counts.myWork },
    { href: '/scan',    labelKey: 'scan',   Icon: ScanLine },
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
    <nav aria-label={t('aria')} className="app-tabbar">
      {items.map(({ href, labelKey, Icon, badge }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`app-tabbar-item${active ? ' is-active' : ''}`}
          >
            <span className="app-tabbar-icon">
              <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              {badge !== undefined && badge > 0 && (
                <span
                  className="app-tabbar-badge"
                  aria-label={t('pending', { count: badge })}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="app-tabbar-label">{t(labelKey)}</span>
          </Link>
        )
      })}
      <button type="button" onClick={() => setCreating(true)} className="app-tabbar-item" aria-haspopup="dialog" aria-expanded={creating}>
        <span className="app-tabbar-icon">
          <Plus size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="app-tabbar-label">{t('create')}</span>
      </button>
      <button type="button" onClick={open} className="app-tabbar-item">
        <span className="app-tabbar-icon">
          <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
          {syncBadge && (
            <span className="app-tabbar-badge" aria-label={syncBadge.label} title={syncBadge.label} style={{ background: syncBadge.color }}>
              {pendingCount > 0 ? (pendingCount > 99 ? '99+' : pendingCount) : '!'}
            </span>
          )}
        </span>
        <span className="app-tabbar-label">{t('menu')}</span>
      </button>
    </nav>
    {creating && <CreateSheet role={role} projects={projects} onClose={() => setCreating(false)} />}
    </>
  )
}
