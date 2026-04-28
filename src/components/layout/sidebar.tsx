'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard, FolderKanban, FileCheck2, ClipboardList, ShieldCheck,
  Settings, Users, ScanLine, ClipboardCheck, Flag, Wrench, CalendarDays,
  Radar, TrendingUp, Award, PackageCheck, Anchor, Workflow, Key, Webhook,
  Bell, Database, History, Tag, Activity, Boxes, FolderTree, LogOut,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/ThemeToggle'
import { useOfflineSync } from '@/hooks/useOfflineSync'

function SyncIndicator() {
  const [mounted, setMounted] = useState(false)
  const { isOnline, pendingCount } = useOfflineSync()
  useEffect(() => { setMounted(true) }, [])

  // Antes de hidratar mostramos un estado neutral para evitar mismatch
  // (useOfflineSync depende de navigator.onLine, que difiere SSR vs client).
  const dotColor = !mounted
    ? '#94a3b8'
    : isOnline
      ? pendingCount > 0 ? '#f59e0b' : '#22c55e'
      : '#ef4444'
  const label = !mounted
    ? '…'
    : isOnline
      ? pendingCount > 0 ? `Syncing ${pendingCount}…` : 'Online'
      : `Offline · ${pendingCount} pending`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 'var(--radius-sm)',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
        boxShadow: `0 0 8px ${dotColor}`,
        border: '1px solid rgba(255,255,255,0.15)',
      }} />
      <span style={{ fontSize: 'var(--text-xs)', color: '#e2e8f0', fontWeight: 500 }}>{label}</span>
    </div>
  )
}

interface NavItem {
  href: string
  labelKey: string
  icon: LucideIcon
}

interface NavGroup {
  groupKey: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'main',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/projects',  labelKey: 'projects',  icon: FolderKanban },
    ],
  },
  {
    groupKey: 'setup',
    items: [
      { href: '/admin/templates',              labelKey: 'itrTemplates',          icon: FileCheck2 },
      { href: '/admin/templates/preservation', labelKey: 'preservationTemplates', icon: ClipboardList },
      { href: '/admin/templates/pssr',         labelKey: 'pssrTemplates',         icon: ShieldCheck },
      { href: '/admin/config',                 labelKey: 'config',                icon: Settings },
      { href: '/admin/users',                  labelKey: 'users',                 icon: Users },
    ],
  },
  {
    groupKey: 'execution',
    items: [
      { href: '/scan',         labelKey: 'scan',         icon: ScanLine },
      { href: '/itrs',         labelKey: 'itrs',         icon: ClipboardCheck },
      { href: '/punch-list',   labelKey: 'punchList',    icon: Flag },
      { href: '/preservation', labelKey: 'preservation', icon: Wrench },
      { href: '/work-plans',   labelKey: 'workPlans',    icon: CalendarDays },
    ],
  },
  {
    groupKey: 'control',
    items: [
      { href: '/control-tower', labelKey: 'controlTower', icon: Radar },
      { href: '/kpis',          labelKey: 'kpis',         icon: TrendingUp },
      { href: '/certificates',  labelKey: 'certificates', icon: Award },
    ],
  },
  {
    groupKey: 'closure',
    items: [
      { href: '/admin/handover', labelKey: 'handover', icon: PackageCheck },
    ],
  },
  {
    groupKey: 'ops',
    items: [
      { href: '/ops/punches', labelKey: 'opsPunches', icon: Anchor },
    ],
  },
  {
    groupKey: 'integrations',
    items: [
      { href: '/admin/workflows',     labelKey: 'workflows',     icon: Workflow },
      { href: '/admin/api-keys',      labelKey: 'apiKeys',       icon: Key },
      { href: '/admin/webhooks',      labelKey: 'webhooks',      icon: Webhook },
      { href: '/admin/notifications', labelKey: 'notifications', icon: Bell },
    ],
  },
  {
    groupKey: 'system',
    items: [
      { href: '/admin/data-quality', labelKey: 'dataQuality', icon: Database },
      { href: '/admin/audit',        labelKey: 'auditLog',    icon: History },
    ],
  },
]

function projectGroupItems(projectId: string): NavItem[] {
  return [
    { href: `/projects/${projectId}`,              labelKey: 'projectOverview', icon: LayoutDashboard },
    { href: `/projects/${projectId}/tags`,         labelKey: 'tags',            icon: Tag },
    { href: `/projects/${projectId}/itrs`,         labelKey: 'itrs',            icon: ClipboardCheck },
    { href: `/projects/${projectId}/punches`,      labelKey: 'punchList',       icon: Flag },
    { href: `/projects/${projectId}/certificates`, labelKey: 'certificates',    icon: Award },
    { href: `/projects/${projectId}/signals`,      labelKey: 'signals',         icon: Activity },
    { href: `/projects/${projectId}/twin`,         labelKey: 'twin',            icon: Boxes },
    { href: `/projects/${projectId}/explorer`,     labelKey: 'explorer',        icon: FolderTree },
    { href: `/projects/${projectId}/work-plans`,   labelKey: 'workPlans',       icon: CalendarDays },
    { href: `/projects/${projectId}/pssr`,         labelKey: 'pssr',            icon: ShieldCheck },
  ]
}

export interface NotifCounts {
  punches?: number
  preservation?: number
  certsPending?: number
  blockers?: number
  dataQuality?: number
}

function badgeFor(href: string, n?: NotifCounts): number {
  if (!n) return 0
  switch (href) {
    case '/punch-list':         return n.punches ?? 0
    case '/preservation':       return n.preservation ?? 0
    case '/certificates':       return n.certsPending ?? 0
    case '/control-tower':      return n.blockers ?? 0
    case '/admin/data-quality': return n.dataQuality ?? 0
    default:                    return 0
  }
}

export default function Sidebar({ notifCounts }: { notifCounts?: NotifCounts }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('Sidebar')

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch ? projectMatch[1] : null

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      aria-label="Primary navigation"
      style={{
        width: 240, minWidth: 240, height: '100vh',
        background: 'var(--sidebar-bg)',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 'var(--text-md)', letterSpacing: '-0.3px' }}>CommUp</div>
            <div style={{ color: 'var(--gray-400)', fontSize: 'var(--text-xs)' }}>{t('platform')}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {/* Project context group (dynamic, rendered first when inside a project) */}
        {currentProjectId && (
          <ProjectContextGroup
            projectId={currentProjectId}
            pathname={pathname}
            label={t('groups.project')}
            tNav={(k) => t(`nav.${k}`)}
          />
        )}

        {NAV_GROUPS.map((group) => (
          <NavGroupBlock
            key={group.groupKey}
            group={group}
            pathname={pathname}
            label={t(`groups.${group.groupKey}`)}
            tNav={(k) => t(`nav.${k}`)}
            notifCounts={notifCounts}
          />
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <SyncIndicator />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <LocaleSwitcher variant="dark" />
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '9px 12px',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.20)',
            borderRadius: 'var(--radius-md)',
            color: '#f87171',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer', fontWeight: 500,
            transition: 'background 0.15s',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.20)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.10)')}
        >
          <LogOut size={14} aria-hidden="true" />
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

interface SidebarLinkProps {
  href: string
  label: string
  Icon: LucideIcon
  active: boolean
  badge?: number
  accent?: boolean
}

function SidebarLink({ href, label, Icon, active, badge, accent }: SidebarLinkProps) {
  const activeBg = accent ? 'rgba(168,85,247,0.18)' : 'rgba(59,130,246,0.15)'
  const activeFg = accent ? '#c084fc' : 'var(--primary-400)'
  const activeBorder = accent ? 'var(--accent-500)' : 'var(--primary-500)'

  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 20px', margin: '1px 8px',
        borderRadius: 'var(--radius-md)', textDecoration: 'none',
        background: active ? activeBg : 'transparent',
        color: active ? activeFg : 'var(--sidebar-text)',
        fontSize: 'var(--text-base)',
        fontWeight: active ? 500 : 400,
        transition: 'background 0.15s, color 0.15s',
        borderLeft: active ? `2px solid ${activeBorder}` : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
          (e.currentTarget as HTMLElement).style.color = 'var(--gray-400)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)'
        }
      }}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, opacity: active ? 1 : 0.85 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span
          aria-label={`${badge} pending`}
          style={{
            background: 'var(--danger-500)', color: '#fff',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
            minWidth: 20, textAlign: 'center', lineHeight: '18px',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </a>
  )
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 20px 4px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      color: '#94a3b8', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function NavGroupBlock({
  group, pathname, label, tNav, notifCounts,
}: {
  group: NavGroup
  pathname: string
  label: string
  tNav: (k: string) => string
  notifCounts?: NotifCounts
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <GroupHeader>{label}</GroupHeader>
      {group.items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={tNav(item.labelKey)}
            Icon={item.icon}
            active={active}
            badge={badgeFor(item.href, notifCounts)}
          />
        )
      })}
    </div>
  )
}

function ProjectContextGroup({
  projectId, pathname, label, tNav,
}: {
  projectId: string
  pathname: string
  label: string
  tNav: (k: string) => string
}) {
  const items = projectGroupItems(projectId)
  return (
    <div style={{
      marginBottom: 12, paddingBottom: 8,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <GroupHeader>{label}</GroupHeader>
      {items.map((item) => {
        // Overview matches exactly; others match prefix
        const isOverview = item.href === `/projects/${projectId}`
        const active = isOverview
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={tNav(item.labelKey)}
            Icon={item.icon}
            active={active}
            accent
          />
        )
      })}
    </div>
  )
}
