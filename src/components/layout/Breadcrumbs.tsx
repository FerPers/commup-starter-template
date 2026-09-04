'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Home } from 'lucide-react'

interface Crumb {
  label: string
  href?: string
}

const TOP_LEVEL_LABELS: Record<string, string> = {
  dashboard: 'dashboard',
  projects: 'projects',
  itrs: 'itrs',
  'punch-list': 'punchList',
  preservation: 'preservation',
  'work-plans': 'workPlans',
  'control-tower': 'controlTower',
  kpis: 'kpis',
  certificates: 'certificates',
  scan: 'scan',
  'my-work': 'myWork',
  inbox: 'inbox',
  home: 'dashboard',
}

const ADMIN_LABELS: Record<string, string> = {
  templates: 'itrTemplates',
  config: 'config',
  users: 'users',
  workflows: 'workflows',
  'api-keys': 'apiKeys',
  webhooks: 'webhooks',
  notifications: 'notifications',
  'data-quality': 'dataQuality',
  audit: 'auditLog',
  handover: 'handover',
}

const PROJECT_SUBLABELS: Record<string, string> = {
  tags: 'tags',
  itrs: 'itrs',
  punches: 'punchList',
  certificates: 'certificates',
  signals: 'signals',
  twin: 'twin',
  explorer: 'explorer',
  'work-plans': 'workPlans',
  pssr: 'pssr',
  kpis: 'kpis',
  loops: 'loops',
  interlocks: 'interlocks',
  'pid-documents': 'pidDocuments',
}

export default function Breadcrumbs({ projectNames }: { projectNames: Record<string, string> }) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar.nav')
  const tBc = useTranslations('Breadcrumbs')

  const segments = pathname.split('/').filter(Boolean)
  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const projectId = projectMatch ? projectMatch[1] : null
  const projectName = projectId ? (projectNames[projectId] ?? null) : null

  const crumbs = buildCrumbs({
    segments,
    projectId,
    projectName,
    t: (k) => safeT(t, k, k),
    tProjects: () => safeT(t, 'projects', 'Projects'),
  })

  return (
    <nav
      aria-label={tBc('label')}
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
                <a
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
                </a>
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

function buildCrumbs({
  segments,
  projectId,
  projectName,
  t,
  tProjects,
}: {
  segments: string[]
  projectId: string | null
  projectName: string | null
  t: (k: string) => string
  tProjects: () => string
}): Crumb[] {
  if (segments.length === 0) return []

  const first = segments[0]

  // /projects/{id}/...
  if (first === 'projects' && projectId) {
    const out: Crumb[] = [
      { label: tProjects(), href: '/projects' },
      {
        label: projectName ?? '…',
        href: `/projects/${projectId}`,
      },
    ]
    const sub = segments[2]
    if (sub) {
      const subKey = PROJECT_SUBLABELS[sub]
      out.push({ label: subKey ? t(subKey) : titleize(sub) })
    }
    return out
  }

  // /admin/...
  if (first === 'admin') {
    const sub = segments[1]
    if (!sub) return [{ label: 'Admin' }]
    const key = ADMIN_LABELS[sub]
    return [{ label: key ? t(key) : titleize(sub) }]
  }

  // /dashboard, /itrs, /punch-list, etc.
  const key = TOP_LEVEL_LABELS[first]
  return [{ label: key ? t(key) : titleize(first) }]
}

function titleize(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
