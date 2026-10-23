'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Home } from 'lucide-react'
import { buildCrumbs } from '@/lib/navigation/crumbs'

export default function Breadcrumbs({ projectNames }: { projectNames: Record<string, string> }) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar.nav')
  const tBc = useTranslations('Breadcrumbs')

  const tSub = useTranslations('Breadcrumbs.sub')
  const tEnt = useTranslations('Breadcrumbs.entity')
  // N0 (H-06): migas desde la ruta completa, con las etiquetas del menú (miga = menú = título).
  const crumbs = buildCrumbs(pathname).map(c => ({
    href: c.href,
    label: c.projectName ? (projectNames[c.label] ?? '…')
      : c.label.startsWith('nav:') ? safeT(t, c.label.slice(4), '…')
      : c.label.startsWith('entity:') ? safeT(tEnt, c.label.slice(7), '…')
      : safeT(tSub, c.label.slice(4), '…'),
  }))

  return (
    <nav
      aria-label={tBc('label')}
      className="topbar-crumbs"
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}
    >
      <ol
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          listStyle: 'none',
          margin: 0,
          padding: 0,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
              }}
            >
              {i > 0 && (
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                />
              )}
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  style={{
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    fontSize: 'var(--text-base)',
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i === 0 && <Home size={14} aria-hidden="true" />}
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  style={{
                    color: isLast ? 'var(--text-strong)' : 'var(--text-muted)',
                    fontWeight: isLast ? 600 : 500,
                    fontSize: 'var(--text-base)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i === 0 && <Home size={14} aria-hidden="true" />}
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function safeT(t: (k: string) => string, key: string, fallback: string): string {
  try {
    const value = t(key)
    return value === key ? fallback : value
  } catch {
    return fallback
  }
}
