'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMounted } from '@/hooks/useMounted'
import {
  LayoutDashboard, FolderKanban, FileCheck2, ClipboardList, ShieldCheck,
  Settings, Users, ScanLine, ClipboardCheck, Flag, Wrench, CalendarDays,
  Radar, TrendingUp, Award, PackageCheck, Anchor, Workflow, Key, Webhook,
  Bell, Database, History, Tag, Activity, Boxes, FolderTree,
  RotateCw, ListChecks, Inbox, GitBranch, Zap, FileImage, Upload,
  ChevronDown, ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { NAV_STORAGE } from '@/lib/constants/navigation'
import type { OrgMemberRole } from '@/types/database'

/**
 * Sidebar (Sprint N, 2026-09-04): tres bloques — Mi trabajo · Proyecto · Organización —
 * más Administración colapsable. Mismos permisos que antes: ocultar aquí es UX,
 * la seguridad real vive en cada page.tsx.
 */

// Copia client-safe de los tiers de src/lib/auth/permissions.ts (ese módulo
// arrastra código de servidor).
const ADMIN_ROLES: readonly OrgMemberRole[] = ['owner', 'admin']
const PRIVILEGED_ROLES: readonly OrgMemberRole[] = ['owner', 'admin', 'architect']
const EDITOR_ROLES: readonly OrgMemberRole[] = ['owner', 'admin', 'architect', 'leader']

/**
 * Pie del sidebar: solo el estado de sincronización, y solo cuando importa
 * (sin conexión o con cola pendiente). Idioma, tema, guía y salir viven en el menú de usuario.
 */
function SidebarFooter() {
  const t = useTranslations('Pwa.sync')
  const mounted = useMounted()
  const { isOnline, pendingCount, syncing, sync } = useOfflineSync()
  if (!mounted || (isOnline && pendingCount === 0)) return null

  // Aquí ya estamos montados y hay algo que mostrar: cola pendiente (ámbar) o sin conexión (rojo).
  const dotColor = isOnline ? '#f59e0b' : '#ef4444'
  const label = isOnline ? t('syncing', { count: pendingCount }) : t('offlinePending', { count: pendingCount })
  const canForceSync = isOnline && pendingCount > 0

  return (
    <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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
      <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: '#e2e8f0', fontWeight: 500 }}>{label}</span>
      {canForceSync && (
        <button
          type="button"
          onClick={() => { void sync() }}
          disabled={syncing}
          aria-label={t('forceSync')}
          title={t('forceSync')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 4,
            color: '#e2e8f0',
            cursor: syncing ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            opacity: syncing ? 0.4 : 0.8,
            flexShrink: 0,
          }}
        >
          <RotateCw size={12} aria-hidden="true" />
        </button>
      )}
    </div>
    </div>
  )
}

export interface NotifCounts {
  /** Pendientes personales (ITRs, punches, plan, firmas) — badge de «Mi trabajo» */
  myWork?: number
  /** Notificaciones sin leer — badge de «Bandeja» */
  inbox?: number
  punches?: number
  preservation?: number
  certsPending?: number
  blockers?: number
  dataQuality?: number
}

type BadgeKey = keyof NotifCounts

interface NavItem {
  href: string
  labelKey: string
  icon: LucideIcon
  /** Roles que ven el ítem; omitido = visible para todos */
  roles?: readonly OrgMemberRole[]
  badge?: BadgeKey
  /** Badge discreto (gris) en vez de rojo: informa, no alarma */
  softBadge?: boolean
  /** Solo coincide con la ruta exacta (para «Resumen» del proyecto) */
  exact?: boolean
}

interface NavGroup {
  groupKey: string
  items: NavItem[]
}

// ── Bloque 1 · Mi trabajo ───────────────────────────────────────────────────
const PERSONAL_ITEMS: NavItem[] = [
  { href: '/my-work',             labelKey: 'myWork',        icon: ListChecks, badge: 'myWork' },
  { href: '/inbox',               labelKey: 'inbox',         icon: Inbox,      badge: 'inbox', softBadge: true },
  { href: '/scan',                labelKey: 'scan',          icon: ScanLine },
  { href: '/admin/notifications', labelKey: 'notifications', icon: Bell },
]

// ── Bloque 2 · Proyecto (contextual) ────────────────────────────────────────
type ProjectSection = { headerKey?: string; items: NavItem[] }

function projectSections(projectId: string): ProjectSection[] {
  const p = `/projects/${projectId}`
  return [
    {
      items: [
        { href: p,                    labelKey: 'projectOverview', icon: LayoutDashboard, exact: true },
        { href: `${p}/tags`,          labelKey: 'tags',            icon: Tag },
        { href: `${p}/itrs`,          labelKey: 'itrs',            icon: ClipboardCheck },
        { href: `${p}/punches`,       labelKey: 'punchList',       icon: Flag },
        { href: `${p}/certificates`,  labelKey: 'certificates',    icon: Award },
        { href: `${p}/kpis`,          labelKey: 'kpis',            icon: TrendingUp },
      ],
    },
    {
      headerKey: 'engineering',
      items: [
        { href: `${p}/signals`,       labelKey: 'signals',         icon: Activity },
        { href: `${p}/loops`,         labelKey: 'loops',           icon: GitBranch },
        { href: `${p}/interlocks`,    labelKey: 'interlocks',      icon: Zap },
        { href: `${p}/pid-documents`, labelKey: 'pidDocuments',    icon: FileImage },
      ],
    },
    {
      headerKey: 'planning',
      items: [
        { href: `${p}/explorer`,      labelKey: 'explorer',        icon: FolderTree },
        { href: `${p}/twin`,          labelKey: 'twin',            icon: Boxes },
        { href: `${p}/work-plans`,    labelKey: 'workPlans',       icon: CalendarDays },
        { href: `${p}/pssr`,          labelKey: 'pssr',            icon: ShieldCheck },
        { href: `${p}/import`,        labelKey: 'import',          icon: Upload, roles: EDITOR_ROLES },
      ],
    },
  ]
}

// ── Bloque 3 · Organización ─────────────────────────────────────────────────
const ORG_GROUP: NavGroup = {
  groupKey: 'organization',
  items: [
    { href: '/dashboard',     labelKey: 'dashboard',       icon: LayoutDashboard },
    { href: '/projects',      labelKey: 'projects',        icon: FolderKanban },
    { href: '/control-tower', labelKey: 'controlTower',    icon: Radar,         badge: 'blockers' },
    { href: '/kpis',          labelKey: 'kpis',            icon: TrendingUp },
    { href: '/itrs',          labelKey: 'allItrs',         icon: ClipboardCheck },
    { href: '/punch-list',    labelKey: 'allPunches',      icon: Flag },
    { href: '/certificates',  labelKey: 'allCertificates', icon: Award,         badge: 'certsPending' },
    { href: '/preservation',  labelKey: 'preservation',    icon: Wrench,        badge: 'preservation' },
    { href: '/work-plans',    labelKey: 'allWorkPlans',    icon: CalendarDays },
    { href: '/ops/punches',   labelKey: 'opsPunches',      icon: Anchor },
    { href: '/admin/handover', labelKey: 'handover',       icon: PackageCheck,  roles: PRIVILEGED_ROLES },
  ],
}

// ── Bloque 4 · Administración (colapsable) ──────────────────────────────────
const ADMIN_GROUP: NavGroup = {
  groupKey: 'admin',
  items: [
    { href: '/admin/templates',              labelKey: 'itrTemplates',          icon: FileCheck2,    roles: EDITOR_ROLES },
    { href: '/admin/templates/preservation', labelKey: 'preservationTemplates', icon: ClipboardList, roles: EDITOR_ROLES },
    { href: '/admin/templates/pssr',         labelKey: 'pssrTemplates',         icon: ShieldCheck,   roles: EDITOR_ROLES },
    { href: '/admin/config',                 labelKey: 'config',                icon: Settings,      roles: ADMIN_ROLES },
    { href: '/admin/users',                  labelKey: 'users',                 icon: Users,         roles: ADMIN_ROLES },
    { href: '/admin/workflows',              labelKey: 'workflows',             icon: Workflow,      roles: PRIVILEGED_ROLES },
    { href: '/admin/api-keys',               labelKey: 'apiKeys',               icon: Key,           roles: PRIVILEGED_ROLES },
    { href: '/admin/webhooks',               labelKey: 'webhooks',              icon: Webhook,       roles: PRIVILEGED_ROLES },
    { href: '/admin/data-quality',           labelKey: 'dataQuality',           icon: Database,      roles: PRIVILEGED_ROLES },
    { href: '/admin/audit',                  labelKey: 'auditLog',              icon: History,       roles: ADMIN_ROLES },
  ],
}

function visibleFor(items: NavItem[], role?: OrgMemberRole): NavItem[] {
  // Sin rol conocido se muestra todo (comportamiento previo); con rol, solo lo permitido.
  return role ? items.filter(item => !item.roles || item.roles.includes(role)) : items
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  // «Templates ITR» (/admin/templates) no debe activarse en /admin/templates/pssr
  if (item.href === '/admin/templates') {
    return pathname === item.href || (pathname.startsWith(item.href + '/') && !/^\/admin\/templates\/(preservation|pssr)/.test(pathname))
  }
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* modo privado / sin storage: se ignora */ }
}

export default function Sidebar({
  notifCounts, isOpen = false, role, projectNames = {},
}: {
  notifCounts?: NotifCounts
  isOpen?: boolean
  role?: OrgMemberRole
  /** id → nombre de los proyectos de la org (para «Último proyecto») */
  projectNames?: Record<string, string>
}) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar')
  const mounted = useMounted()

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch ? projectMatch[1] : null

  // «Último proyecto»: recordado en localStorage; solo se ofrece si sigue siendo de la org activa.
  const [lastProjectId, setLastProjectId] = useState<string | null>(null)
  useEffect(() => {
    if (currentProjectId) {
      writeStorage(NAV_STORAGE.lastProject, currentProjectId)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el estado con la ruta actual; sin esto el grupo de proyecto no cambia al navegar entre proyectos
      setLastProjectId(currentProjectId)
    } else {
      setLastProjectId(readStorage(NAV_STORAGE.lastProject))
    }
  }, [currentProjectId])

  // Administración colapsada por defecto; la preferencia se recuerda por navegador.
  const [adminOpen, setAdminOpen] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la preferencia tras montar (localStorage no existe en SSR)
    setAdminOpen(readStorage(NAV_STORAGE.adminOpen) === '1')
  }, [])
  const inAdmin = ADMIN_GROUP.items.some(item => isActive(pathname, item))
  function toggleAdmin() {
    const next = !adminOpen
    setAdminOpen(next)
    writeStorage(NAV_STORAGE.adminOpen, next ? '1' : '0')
  }

  const projectId = currentProjectId ?? (mounted && lastProjectId && projectNames[lastProjectId] ? lastProjectId : null)
  const projectLabel = projectId ? (projectNames[projectId] ?? t('groups.project')) : null
  const projectHeader = currentProjectId ? t('groups.project') : t('groups.lastProject')

  const orgItems = visibleFor(ORG_GROUP.items, role)
  const adminItems = visibleFor(ADMIN_GROUP.items, role)
  const tNav = (k: string) => t(`nav.${k}`)

  return (
    <aside
      aria-label="Primary navigation"
      className={`app-sidebar${isOpen ? ' is-open' : ''}`}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/isotipo-white.png"
            alt=""
            aria-hidden="true"
            style={{ width: 38, height: 'auto', flexShrink: 0, display: 'block' }}
          />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 'var(--text-md)', letterSpacing: '-0.3px' }}>CommUp</div>
            <div style={{ color: 'var(--gray-400)', fontSize: 'var(--text-xs)' }}>{t('platform')}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {/* 1 · Mi trabajo */}
        <div className="nav-group" style={{ marginBottom: 4 }}>
          <GroupHeader>{t('groups.myWork')}</GroupHeader>
          {visibleFor(PERSONAL_ITEMS, role).map(item => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={tNav(item.labelKey)}
              Icon={item.icon}
              active={isActive(pathname, item)}
              badge={item.badge ? notifCounts?.[item.badge] : undefined}
              softBadge={item.softBadge}
            />
          ))}
        </div>

        <Divider />

        {/* 2 · Proyecto (actual o último visitado) */}
        {projectId && (
          <>
            <div className="nav-group" style={{ marginBottom: 4 }}>
              <GroupHeader>
                <span style={{ color: 'var(--brand-orange)' }}>{projectHeader}</span>
                {projectLabel && (
                  <span title={projectLabel} style={{ marginLeft: 6, textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: '#a5b4cf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    · {projectLabel}
                  </span>
                )}
              </GroupHeader>
              {projectSections(projectId).map((section, idx) => {
                const items = visibleFor(section.items, role)
                if (items.length === 0) return null
                return (
                  <div key={section.headerKey ?? idx}>
                    {section.headerKey && <SubHeader>{t(`groups.${section.headerKey}`)}</SubHeader>}
                    {items.map(item => (
                      <SidebarLink
                        key={item.href}
                        href={item.href}
                        label={tNav(item.labelKey)}
                        Icon={item.icon}
                        active={isActive(pathname, item)}
                        accent
                        compact={!!section.headerKey}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
            <Divider />
          </>
        )}

        {/* 3 · Organización */}
        {orgItems.length > 0 && (
          <div className="nav-group" style={{ marginBottom: 4 }}>
            <GroupHeader>{t('groups.organization')}</GroupHeader>
            {orgItems.map(item => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={tNav(item.labelKey)}
                Icon={item.icon}
                active={isActive(pathname, item)}
                badge={item.badge ? notifCounts?.[item.badge] : undefined}
              />
            ))}
          </div>
        )}

        {/* 4 · Administración (colapsable; abierta si estás dentro) */}
        {adminItems.length > 0 && (
          <div className="nav-group" style={{ marginBottom: 4 }}>
            <button
              type="button"
              onClick={toggleAdmin}
              aria-expanded={adminOpen || inAdmin}
              aria-controls="sidebar-admin-group"
              style={{
                width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                color: '#94a3b8', textTransform: 'uppercase', textAlign: 'left',
              }}
            >
              <span style={{ flex: 1 }}>{t('groups.admin')}</span>
              {(adminOpen || inAdmin)
                ? <ChevronDown size={12} aria-hidden="true" />
                : <ChevronRight size={12} aria-hidden="true" />}
            </button>
            <div id="sidebar-admin-group" hidden={!(adminOpen || inAdmin)}>
              {adminItems.map(item => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={tNav(item.labelKey)}
                  Icon={item.icon}
                  active={isActive(pathname, item)}
                  badge={item.badge ? notifCounts?.[item.badge] : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </nav>

      <SidebarFooter />
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
  softBadge?: boolean
  accent?: boolean
  compact?: boolean
}

function SidebarLink({ href, label, Icon, active, badge, softBadge, accent, compact }: SidebarLinkProps) {
  const activeBg = accent ? 'rgba(244,122,32,0.16)' : 'rgba(59,130,246,0.15)'
  const activeFg = accent ? 'var(--brand-orange-soft)' : 'var(--primary-400)'
  const activeBorder = accent ? 'var(--brand-orange)' : 'var(--primary-500)'

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: compact ? '7px 20px 7px 28px' : '9px 20px', margin: '1px 8px',
        borderRadius: 'var(--radius-md)', textDecoration: 'none',
        background: active ? activeBg : 'transparent',
        color: active ? activeFg : 'var(--sidebar-text)',
        fontSize: compact ? 'var(--text-sm)' : 'var(--text-base)',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.15s, color 0.15s',
        borderLeft: active ? `3px solid ${activeBorder}` : '3px solid transparent',
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
      <Icon size={compact ? 14 : 16} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: active ? activeFg : undefined, opacity: active ? 1 : 0.85 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span
          aria-label={`${badge} pending`}
          style={{
            background: softBadge ? 'rgba(255,255,255,0.12)' : 'var(--danger-500)',
            color: softBadge ? '#cbd5e1' : '#fff',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
            minWidth: 20, textAlign: 'center', lineHeight: '18px',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 20px 4px', display: 'flex', alignItems: 'baseline', minWidth: 0,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      color: '#94a3b8', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 20px 2px 28px',
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
      color: '#64748b', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 18px 8px' }} />
}
