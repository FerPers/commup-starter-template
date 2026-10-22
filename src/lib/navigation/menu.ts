/**
 * Menú por fase y rol (N1, decisiones de Luis 2026-10-21; maquetas «Maquetas N1»).
 *
 * Cada ítem declara su PERMISO (`tier`, la misma fuente que el guard de su página: test de paridad) y su
 * AUDIENCIA (a quién le sirve a diario). Lo que el rol puede ver pero no le corresponde va a «Más…».
 * - inspector → field · líder → lead · arquitecto → plan (vista de planificación) · owner/admin → mgmt · cliente → client
 * - mgmt ve el proyecto por fases plegables (abierta la de más actividad); el resto, una lista plana en orden de fase.
 * Sin dependencias de React: el menú lateral (`sidebar.tsx`) solo pinta lo que devuelve `buildMenu`.
 */

import { ROLE_TIERS } from '@/lib/constants/roles'

export type Audience = 'field' | 'lead' | 'plan' | 'mgmt' | 'client'
export type Tier = keyof typeof ROLE_TIERS
export type Phase = 'prep' | 'mc' | 'com' | 'su' | 'mgmt'
export const PHASES: readonly Phase[] = ['prep', 'mc', 'com', 'su', 'mgmt']

export const ROLE_AUDIENCE: Record<string, Audience> = {
  inspector: 'field', leader: 'lead', architect: 'plan', admin: 'mgmt', owner: 'mgmt', client: 'client',
}

export type MenuItemDef = {
  key: string
  /** Ruta; `{p}` = proyecto actual. */
  href: string
  /** Etiqueta en Sidebar.nav */
  labelKey: string
  /** Permiso (= guard de la página); sin tier = todos los miembros. */
  tier?: Tier
  audience: readonly Audience[]
  phase?: Phase
  /** Subrutas con ítem propio (no activan este) */
  notUnder?: readonly string[]
  /** N2c: otras rutas del mismo hub que también activan este ítem (pestañas por ruta). */
  also?: readonly string[]
  exact?: boolean
  badge?: 'myWork' | 'preservation'
}

const ALL: readonly Audience[] = ['field', 'lead', 'plan', 'mgmt', 'client']

export const PERSONAL_ITEMS: readonly MenuItemDef[] = [
  { key: 'myWork', href: '/my-work', labelKey: 'myWork', audience: ALL, badge: 'myWork' },
  { key: 'scan', href: '/scan', labelKey: 'scan', audience: ['field', 'lead'] },
]

/** Arriba del proyecto, fuera de las fases. */
export const PROJECT_TOP: readonly MenuItemDef[] = [
  { key: 'overview', href: '/projects/{p}', labelKey: 'projectOverview', audience: ALL, exact: true },
  { key: 'readiness', href: '/projects/{p}/readiness', labelKey: 'readiness', audience: ['lead', 'plan', 'mgmt', 'client'] },
]

/** Ítems del proyecto por fase (orden = orden en el menú). */
export const PROJECT_ITEMS: readonly MenuItemDef[] = [
  // Planificación primero para el arquitecto (se reordena en buildMenu)
  { key: 'systems', href: '/projects/{p}/systems', labelKey: 'systems', audience: ['lead', 'plan', 'mgmt'], phase: 'prep' },
  { key: 'tags', href: '/projects/{p}/tags', labelKey: 'tags', audience: ['field', 'lead', 'mgmt'], phase: 'prep' },
  { key: 'documents', href: '/projects/{p}/documents', labelKey: 'documents', audience: ['lead', 'mgmt', 'client'], phase: 'prep' },
  // N2d: los P&ID son documentos (Documentos › P&ID con visor).
  { key: 'vendors', href: '/projects/{p}/vendors', labelKey: 'vendors', audience: ['lead', 'mgmt'], phase: 'prep' },
  { key: 'signatories', href: '/projects/{p}/signatories', labelKey: 'signatories', audience: ['mgmt'], phase: 'prep' },
  { key: 'import', href: '/projects/{p}/import', labelKey: 'import', tier: 'privileged', audience: ['mgmt'], phase: 'prep' },
  { key: 'itrs', href: '/projects/{p}/itrs', labelKey: 'itrs', audience: ['field', 'lead', 'mgmt'], phase: 'mc' },
  { key: 'punches', href: '/projects/{p}/punches', labelKey: 'punchList', audience: ['field', 'lead', 'mgmt', 'client'], phase: 'mc' },
  { key: 'preservation', href: '/projects/{p}/preservation', labelKey: 'preservation', audience: ['field', 'lead', 'mgmt'], phase: 'mc', badge: 'preservation' },
  { key: 'registers', href: '/projects/{p}/registers', labelKey: 'registers', audience: ['field', 'lead', 'mgmt'], phase: 'mc' },
  // N2c: un solo ítem para el hub (pestañas Señales · Lazos · Matrices C&E · Importar).
  { key: 'signals', href: '/projects/{p}/signals', labelKey: 'instrumentation', audience: ['mgmt'], phase: 'com',
    also: ['/projects/{p}/loops', '/projects/{p}/ce-matrices', '/projects/{p}/import-signals'] },
  { key: 'certificates', href: '/projects/{p}/certificates', labelKey: 'certificates', audience: ['lead', 'mgmt', 'client'], phase: 'com' },
  { key: 'pssr', href: '/projects/{p}/pssr', labelKey: 'pssr', audience: ['lead', 'mgmt', 'client'], phase: 'com' },
  { key: 'startup', href: '/projects/{p}/startup', labelKey: 'startup', audience: ['field', 'lead', 'mgmt'], phase: 'su',
    notUnder: ['/projects/{p}/startup/performance', '/projects/{p}/startup/operations'] },
  { key: 'performance', href: '/projects/{p}/startup/performance', labelKey: 'performance', audience: ['mgmt', 'client'], phase: 'su' },
  { key: 'operations', href: '/projects/{p}/startup/operations', labelKey: 'operations', audience: ['mgmt', 'client'], phase: 'su' },
  { key: 'daily', href: '/projects/{p}/daily', labelKey: 'daily', audience: ['lead', 'plan', 'mgmt', 'client'], phase: 'mgmt' },
  // N2c: Planificación = look-ahead de gates + planes de trabajo (pestañas por ruta).
  { key: 'planning', href: '/projects/{p}/planning/lookahead', labelKey: 'planning', audience: ['plan', 'mgmt'], phase: 'mgmt',
    also: ['/projects/{p}/work-plans', '/projects/{p}/planning'] },
  { key: 'kpis', href: '/projects/{p}/kpis', labelKey: 'kpis', audience: ['plan', 'mgmt'], phase: 'mgmt' },
]

/** Portafolio (organización). Lo que no es de su audiencia va a «Más…». */
export const PORTFOLIO_ITEMS: readonly MenuItemDef[] = [
  { key: 'projects', href: '/projects', labelKey: 'projects', audience: ['mgmt'] },
  { key: 'dashboard', href: '/dashboard', labelKey: 'dashboard', audience: ['plan', 'mgmt'] },
  { key: 'opsPunches', href: '/ops/punches', labelKey: 'opsPunches', audience: ['mgmt'] },
  { key: 'handover', href: '/admin/handover', labelKey: 'handover', tier: 'privileged', audience: ['mgmt'] },
  // N2c: «Todos los ITR / punches / certificados / planes / preservación» ya no son entradas: son el alcance
  // «Todos los proyectos» de cada lista del proyecto (las rutas viejas redirigen).
  { key: 'orgKpis', href: '/kpis', labelKey: 'orgKpis', audience: [] },
]

/** Administración, plegada y por grupos. */
export const ADMIN_GROUPS: readonly { key: string; items: readonly MenuItemDef[] }[] = [
  { key: 'adminOrg', items: [
    { key: 'users', href: '/admin/users', labelKey: 'users', tier: 'admin', audience: ALL },
    { key: 'companies', href: '/admin/companies', labelKey: 'companies', tier: 'editor', audience: ALL },
    { key: 'config', href: '/admin/config', labelKey: 'config', tier: 'admin', audience: ALL },
    { key: 'gates', href: '/admin/gates', labelKey: 'gates', tier: 'admin', audience: ALL },
  ] },
  { key: 'adminTemplates', items: [
    { key: 'itrTemplates', href: '/admin/templates', labelKey: 'itrTemplates', tier: 'editor', audience: ALL, notUnder: ['/admin/templates/preservation', '/admin/templates/pssr'] },
    { key: 'preservationTemplates', href: '/admin/templates/preservation', labelKey: 'preservationTemplates', tier: 'editor', audience: ALL },
    { key: 'pssrTemplates', href: '/admin/templates/pssr', labelKey: 'pssrTemplates', tier: 'editor', audience: ALL },
    { key: 'registerTypes', href: '/admin/registers', labelKey: 'registerTypes', tier: 'privileged', audience: ALL },
  ] },
  { key: 'adminResources', items: [
    { key: 'testEquipment', href: '/admin/test-equipment', labelKey: 'testEquipment', tier: 'editor', audience: ALL },
  ] },
  { key: 'adminIntegration', items: [
    { key: 'workflows', href: '/admin/workflows', labelKey: 'workflows', tier: 'privileged', audience: ALL },
    { key: 'apiKeys', href: '/admin/api-keys', labelKey: 'apiKeys', tier: 'privileged', audience: ALL },
    { key: 'webhooks', href: '/admin/webhooks', labelKey: 'webhooks', tier: 'privileged', audience: ALL },
  ] },
  { key: 'adminControl', items: [
    { key: 'dataQuality', href: '/admin/data-quality', labelKey: 'dataQuality', tier: 'privileged', audience: ALL },
    { key: 'auditLog', href: '/admin/audit', labelKey: 'auditLog', tier: 'admin', audience: ALL },
  ] },
]

export function allowed(item: MenuItemDef, role: string): boolean {
  return !item.tier || ROLE_TIERS[item.tier].includes(role)
}

export type MenuLink = { key: string; href: string; labelKey: string; exact?: boolean; notUnder?: string[]; also?: string[]; badge?: MenuItemDef['badge'] }
export type MenuModel = {
  audience: Audience
  personal: MenuLink[]
  /** Ítems del proyecto sin fase (lista plana) o arriba de las fases (mgmt). */
  project: MenuLink[]
  /** Solo mgmt: el proyecto por fases plegables. */
  phases: { phase: Phase; items: MenuLink[] }[]
  portfolio: MenuLink[]
  more: MenuLink[]
  admin: { key: string; items: MenuLink[] }[]
}

const link = (i: MenuItemDef, projectId: string | null): MenuLink => ({
  key: i.key, labelKey: i.labelKey, exact: i.exact, badge: i.badge,
  href: projectId ? i.href.replaceAll('{p}', projectId) : i.href,
  notUnder: i.notUnder?.map(n => (projectId ? n.replaceAll('{p}', projectId) : n)),
  also: i.also?.map(n => (projectId ? n.replaceAll('{p}', projectId) : n)),
})

/** El menú de un rol, dentro de un proyecto (`projectId`) o fuera (null: solo lo personal, portafolio y Más…). */
export function buildMenu(role: string, projectId: string | null): MenuModel {
  const audience = ROLE_AUDIENCE[role] ?? 'field'
  const mine = (i: MenuItemDef) => i.audience.includes(audience)
  const ok = (i: MenuItemDef) => allowed(i, role)
  const more: MenuLink[] = []

  const personal = PERSONAL_ITEMS.filter(ok).filter(mine).map(i => link(i, projectId))
  let project: MenuLink[] = []
  let phases: MenuModel['phases'] = []
  if (projectId) {
    const top = PROJECT_TOP.filter(ok)
    const items = PROJECT_ITEMS.filter(ok)
    if (audience === 'mgmt') {
      project = top.map(i => link(i, projectId))
      phases = PHASES.map(phase => ({ phase, items: items.filter(i => i.phase === phase).map(i => link(i, projectId)) }))
        .filter(p => p.items.length > 0)
    } else {
      // Arquitecto: planificación primero (decisión N1: es la vista del rol).
      const ordered = audience === 'plan'
        ? [...items.filter(i => i.key === 'planning'), ...items.filter(i => i.key !== 'planning')]
        : items
      project = [...top.filter(mine), ...ordered.filter(mine)].map(i => link(i, projectId))
      more.push(...top.filter(i => !mine(i)).map(i => link(i, projectId)), ...ordered.filter(i => !mine(i)).map(i => link(i, projectId)))
    }
  }
  const portfolioOk = PORTFOLIO_ITEMS.filter(ok)
  const portfolio = portfolioOk.filter(mine).map(i => link(i, projectId))
  more.push(...portfolioOk.filter(i => !mine(i)).map(i => link(i, projectId)))
  const admin = ADMIN_GROUPS.map(g => ({ key: g.key, items: g.items.filter(ok).map(i => link(i, projectId)) })).filter(g => g.items.length > 0)
  return { audience, personal, project, phases, portfolio, more, admin }
}

/** Entradas visibles sin desplegar nada; cada fase cuenta como una. «Más…» y Administración son plegables y no cuentan. */
export function visibleEntries(m: MenuModel): number {
  return m.personal.length + m.project.length + m.phases.length + m.portfolio.length
}

/**
 * Fase abierta por defecto (decisión N1): la de más actividad reciente del proyecto. Sin actividad, Completamiento;
 * en empate gana la que va primero en la obra (MC antes que el resto: es donde más gente trabaja).
 */
export function pickActivePhase(counts: Partial<Record<Phase, number>>): Phase {
  const order: Phase[] = ['mc', 'prep', 'com', 'su', 'mgmt']
  return order.reduce((best, p) => ((counts[p] ?? 0) > (counts[best] ?? 0) ? p : best), 'mc' as Phase)
}

/** Tipos de evento del bus (domain_events.aggregate_type) por fase. */
export const EVENT_PHASE: Record<string, Phase> = {
  tag: 'prep', system: 'prep', subsystem: 'prep',
  itr: 'mc', punch: 'mc',
  certificate: 'com', signal: 'com', loop: 'com',
  transfer: 'su', handover_package: 'su',
}
