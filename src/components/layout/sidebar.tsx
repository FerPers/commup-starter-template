'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMounted } from '@/hooks/useMounted'
import {
  LayoutDashboard, FolderKanban, FileCheck2, ClipboardList, ShieldCheck,
  Settings, Users, ScanLine, ClipboardCheck, Flag, Wrench, CalendarDays,
  Radar, TrendingUp, Award, PackageCheck, Anchor, Workflow, Key, Webhook,
  Database, History, Tag, Activity, Boxes, FolderTree,
  RotateCw, ListChecks, GitBranch, Zap, FileImage, Upload,
  ChevronDown, ChevronRight, Milestone, Gauge, Network, CalendarCheck, Power, FileText, Building2, Truck, UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { NAV_STORAGE } from '@/lib/constants/navigation'
import type { OrgMemberRole } from '@/types/database'
import { buildMenu, type MenuLink, type Phase } from '@/lib/navigation/menu'
import { getActivePhase } from '@/app/actions/navigation'
import ProjectSwitcher, { rememberRecentProject } from './ProjectSwitcher'

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
      <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--sidebar-text-strong)', fontWeight: 500 }}>{label}</span>
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
            color: 'var(--sidebar-text-strong)',
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
  /** Notificaciones sin leer — badge de la campana */
  inbox?: number
  /** Planes de preservación vencidos */
  preservation?: number
}

type BadgeKey = keyof NotifCounts

/** Ícono de cada entrada (por clave del modelo en src/lib/navigation/menu.ts). */
const ICONS: Record<string, LucideIcon> = {
  myWork: ListChecks, scan: ScanLine, overview: LayoutDashboard, readiness: Radar, systems: Network, tags: Tag, explorer: FolderTree,
  twin: Boxes, documents: FileText, pidDocuments: FileImage, vendors: Truck, signatories: UserCheck, import: Upload, itrs: ClipboardCheck,
  punches: Flag, preservation: Wrench, registers: ClipboardList, signals: Activity, loops: GitBranch, ceMatrices: Zap, certificates: Award,
  pssr: ShieldCheck, startup: Power, performance: Gauge, operations: Anchor, daily: CalendarCheck, workPlans: CalendarDays, planning: CalendarDays, kpis: TrendingUp,
  projects: FolderKanban, dashboard: LayoutDashboard, opsPunches: Anchor, handover: PackageCheck, allItrs: ClipboardCheck, allPunches: Flag,
  allCertificates: Award, globalPreservation: Wrench, allWorkPlans: CalendarDays, orgKpis: TrendingUp, users: Users, companies: Building2,
  config: Settings, gates: Milestone, itrTemplates: FileCheck2, preservationTemplates: ClipboardList, pssrTemplates: ShieldCheck,
  registerTypes: ClipboardList, testEquipment: Gauge, workflows: Workflow, apiKeys: Key, webhooks: Webhook, dataQuality: Database, auditLog: History,
}

function isActive(pathname: string, item: MenuLink): boolean {
  const href = item.href.split('?')[0]
  if (item.exact) return pathname === href
  if (item.notUnder?.some(n => pathname === n || pathname.startsWith(n + '/'))) return false
  if (item.also?.some(n => pathname === n || pathname.startsWith(n + '/'))) return true
  return pathname === href || pathname.startsWith(href + '/')
}

function readStorage(key: string, session = false): string | null {
  try { return (session ? window.sessionStorage : window.localStorage).getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string, session = false) {
  try { (session ? window.sessionStorage : window.localStorage).setItem(key, value) } catch { /* modo privado / sin storage: se ignora */ }
}

/**
 * Menú por fase y rol (N1). Qué se ve lo decide `buildMenu` (src/lib/navigation/menu.ts): permiso = guard de la
 * página (test de paridad) y audiencia del rol; lo que el rol puede ver pero no usa a diario va a «Más…».
 * Ocultar aquí es UX: la seguridad real vive en cada page.tsx.
 */
export default function Sidebar({
  notifCounts, isOpen = false, role, projectNames = {},
}: {
  notifCounts?: NotifCounts
  isOpen?: boolean
  role?: OrgMemberRole
  /** id → nombre de los proyectos de la org (selector y «último proyecto») */
  projectNames?: Record<string, string>
}) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar')
  const mounted = useMounted()

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch && projectNames[projectMatch[1]] ? projectMatch[1] : null

  // «Último proyecto»: recordado en localStorage; solo se ofrece si sigue siendo de la org activa.
  const [lastProjectId, setLastProjectId] = useState<string | null>(null)
  useEffect(() => {
    if (currentProjectId) {
      writeStorage(NAV_STORAGE.lastProject, currentProjectId)
      rememberRecentProject(currentProjectId)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el estado con la ruta actual; sin esto el grupo de proyecto no cambia al navegar entre proyectos
      setLastProjectId(currentProjectId)
    } else {
      setLastProjectId(readStorage(NAV_STORAGE.lastProject))
    }
  }, [currentProjectId])
  const projectId = currentProjectId ?? (mounted && lastProjectId && projectNames[lastProjectId] ? lastProjectId : null)

  const menu = useMemo(() => buildMenu(role ?? 'inspector', projectId), [role, projectId])
  const tNav = (k: string) => t(`nav.${k}`)

  // Administración y «Más…»: plegados; se recuerda si quedaron abiertos. Se abren solos si estás dentro.
  const [adminOpen, setAdminOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee las preferencias tras montar (localStorage no existe en SSR)
    setAdminOpen(readStorage(NAV_STORAGE.adminOpen) === '1')
    setMoreOpen(readStorage(NAV_STORAGE.moreOpen) === '1')
  }, [])
  const adminLinks = menu.admin.flatMap(g => g.items)
  const inAdmin = adminLinks.some(item => isActive(pathname, item))
  const inMore = menu.more.some(item => isActive(pathname, item))
  const toggle = (key: string, value: boolean, set: (v: boolean) => void) => { set(value); writeStorage(key, value ? '1' : '0') }

  // Owner/admin: fases plegables; abierta la de más actividad del proyecto (una consulta por proyecto y sesión).
  const [openPhases, setOpenPhases] = useState<Set<Phase>>(new Set())
  useEffect(() => {
    if (!projectId || menu.phases.length === 0) return
    const cacheKey = NAV_STORAGE.activePhase + projectId
    const cached = readStorage(cacheKey, true) as Phase | null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre la fase guardada en la sesión al cambiar de proyecto
    if (cached) { setOpenPhases(new Set([cached])); return }
    let alive = true
    getActivePhase({ projectId }).then(res => {
      if (!alive || !('phase' in res) || !res.phase) return
      writeStorage(cacheKey, res.phase, true)
      setOpenPhases(new Set([res.phase]))
    }).catch(() => { /* sin red: quedan plegadas */ })
    return () => { alive = false }
  }, [projectId, menu.phases.length])
  const togglePhase = (p: Phase) => setOpenPhases(prev => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n })

  const link = (item: MenuLink, opts?: { accent?: boolean; compact?: boolean }) => (
    <SidebarLink key={item.key} href={item.href} label={tNav(item.labelKey)} Icon={ICONS[item.key] ?? LayoutDashboard}
      active={isActive(pathname, item)} badge={item.badge ? notifCounts?.[item.badge as BadgeKey] : undefined}
      accent={opts?.accent} compact={opts?.compact} />
  )

  return (
    <aside
      aria-label={t('a11y.primaryNav')}
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
            <div style={{ color: 'var(--sidebar-text-dim)', fontSize: 'var(--text-xs)' }}>{t('platform')}</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {/* 1 · Mi trabajo */}
        <div className="nav-group" style={{ marginBottom: 4 }}>
          <GroupHeader>{t('groups.myWork')}</GroupHeader>
          {menu.personal.map(item => link(item))}
        </div>

        <Divider />

        {/* 2 · Proyecto: selector + entradas del rol (o fases plegables para owner/admin) */}
        <div className="nav-group" style={{ marginBottom: 4 }}>
          <GroupHeader><span style={{ color: 'var(--brand-orange)' }}>{currentProjectId || !projectId ? t('groups.project') : t('groups.lastProject')}</span></GroupHeader>
          <ProjectSwitcher currentId={projectId} projectNames={projectNames} />
          {menu.project.map(item => link(item, { accent: true }))}
          {menu.phases.map(({ phase, items }) => {
            const open = openPhases.has(phase) || items.some(i => isActive(pathname, i))
            return (
              <div key={phase}>
                <FoldButton open={open} onClick={() => togglePhase(phase)} label={t(`groups.phase_${phase}`)} count={items.length} />
                {open && items.map(item => link(item, { accent: true, compact: true }))}
              </div>
            )
          })}
        </div>

        {/* 3 · Portafolio */}
        {menu.portfolio.length > 0 && (
          <>
            <Divider />
            <div className="nav-group" style={{ marginBottom: 4 }}>
              <GroupHeader>{t('groups.portfolio')}</GroupHeader>
              {menu.portfolio.map(item => link(item))}
            </div>
          </>
        )}

        {/* 4 · Más… (lo que el rol puede ver pero no usa a diario) */}
        {menu.more.length > 0 && (
          <div className="nav-group" style={{ marginBottom: 4 }}>
            <FoldButton open={moreOpen || inMore} onClick={() => toggle(NAV_STORAGE.moreOpen, !moreOpen, setMoreOpen)} label={t('groups.more')} count={menu.more.length} header />
            {(moreOpen || inMore) && menu.more.map(item => link(item, { compact: true }))}
          </div>
        )}

        {/* 5 · Administración (plegada por grupos) */}
        {menu.admin.length > 0 && (
          <div className="nav-group" style={{ marginBottom: 4 }}>
            <FoldButton open={adminOpen || inAdmin} onClick={() => toggle(NAV_STORAGE.adminOpen, !adminOpen, setAdminOpen)} label={t('groups.admin')} count={adminLinks.length} header />
            {(adminOpen || inAdmin) && menu.admin.map(g => (
              <div key={g.key}>
                <SubHeader>{t(`groups.${g.key}`)}</SubHeader>
                {g.items.map(item => link(item, { compact: true }))}
              </div>
            ))}
          </div>
        )}
      </nav>

      <SidebarFooter />
    </aside>
  )
}

/** Encabezado plegable (fases, «Más…», Administración). */
function FoldButton({ open, onClick, label, count, header }: { open: boolean; onClick: () => void; label: string; count: number; header?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        padding: header ? '8px 20px 4px' : '7px 20px', display: 'flex', alignItems: 'center', gap: 6,
        fontSize: header ? 10 : 'var(--text-sm)', fontWeight: header ? 700 : 600, letterSpacing: header ? '0.08em' : 0,
        textTransform: header ? 'uppercase' : 'none', color: open ? 'var(--sidebar-text-strong)' : 'var(--sidebar-text-dim)',
      }}>
      {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
      <span style={{ flex: 1 }}>{label}</span>
      {!open && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--sidebar-text-faint)' }}>{count}</span>}
    </button>
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
  const t = useTranslations('Sidebar')
  const activeBg = accent ? 'rgba(244,122,32,0.16)' : 'rgba(59,130,246,0.15)'
  const activeFg = accent ? 'var(--brand-orange-soft)' : 'var(--sidebar-link-active)'
  const activeBorder = accent ? 'var(--brand-orange)' : 'var(--sidebar-link-border)'

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
          (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text-dim)'
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
          aria-label={t('a11y.pending', { count: badge })}
          style={{
            background: softBadge ? 'rgba(255,255,255,0.12)' : 'var(--danger-500)',
            color: softBadge ? 'var(--sidebar-text-dim)' : '#fff',
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
      color: 'var(--sidebar-text-dim)', textTransform: 'uppercase',
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
      color: 'var(--sidebar-text-faint)', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 18px 8px' }} />
}
