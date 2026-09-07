'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ListChecks, ScanLine, Inbox, Menu, type LucideIcon } from 'lucide-react'
import { useDrawerControls } from './DrawerContext'

/**
 * Barra inferior móvil (2026-09-07) para roles de campo (inspector, leader).
 * Solo se ve por debajo de 1024px (ver `.app-tabbar` en globals.css); el layout
 * decide si se renderiza según el rol (FIELD_ROLES). Mostrar/ocultar aquí es UX:
 * la seguridad real vive en cada page.tsx.
 *
 * Ítems: Mi trabajo (badge de pendientes) · Escanear · Bandeja (badge de no leídas) · Menú (abre el drawer).
 */

interface MobileTabBarProps {
  counts: { myWork: number; inbox: number }
}

type TabItem = {
  href: string
  labelKey: 'myWork' | 'scan' | 'inbox'
  Icon: LucideIcon
  badge?: number
  softBadge?: boolean
}

export default function MobileTabBar({ counts }: MobileTabBarProps) {
  const t = useTranslations('MobileTabBar')
  const pathname = usePathname()
  const { open } = useDrawerControls()

  const items: TabItem[] = [
    { href: '/my-work', labelKey: 'myWork', Icon: ListChecks, badge: counts.myWork },
    { href: '/scan',    labelKey: 'scan',   Icon: ScanLine },
    { href: '/inbox',   labelKey: 'inbox',  Icon: Inbox, badge: counts.inbox, softBadge: true },
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav aria-label={t('aria')} className="app-tabbar">
      {items.map(({ href, labelKey, Icon, badge, softBadge }) => {
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
                  className={`app-tabbar-badge${softBadge ? ' is-soft' : ''}`}
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
      <button type="button" onClick={open} className="app-tabbar-item">
        <span className="app-tabbar-icon">
          <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="app-tabbar-label">{t('menu')}</span>
      </button>
    </nav>
  )
}
