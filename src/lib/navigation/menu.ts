/**
 * Menú por rol (N1, decisiones de Luis 2026-10-21) con la opción C de A19 (maqueta «A08 + A19», aprobada 2026-10-25):
 * los módulos quedan fijos por tipo de trabajo y las fases son de la ORG (dinámicas: las pinta el sidebar con
 * `getMenuPhases`), cada una con «liberados / total» y atajos a las listas ya filtradas por esa fase.
 *
 * Cada ítem declara su PERMISO (`tier`, la misma fuente que el guard de su página: test de paridad), su AUDIENCIA (a
 * quién le sirve a diario) y su GRUPO fijo. Lo que el rol puede ver pero no le corresponde va a «Más…».
 * - inspector → field · líder → lead · arquitecto → plan · owner/admin → mgmt · cliente → client
 * - mgmt: grupos fijos + «Configuración del proyecto» plegada + una sección plegable por fase de la org.
 * - lead (D9 ajustada): los mismos grupos fijos con sus ítems de audiencia; las fases van juntas en un plegable
 *   «Por fase» para no pasar de su meta de 17 entradas.
 * - inspector, arquitecto y cliente: lista plana (sin cambios de estructura).
 * Sin dependencias de React: el menú lateral (`sidebar.tsx`) solo pinta lo que devuelve `buildMenu`.
 */

import { ROLE_TIERS } from '@/lib/constants/roles'

export type Audience = 'field' | 'lead' | 'plan' | 'mgmt' | 'client'
export type Tier = keyof typeof ROLE_TIERS
/** Grupos fijos del proyecto (A19 · C). `config` se pinta plegado. */
export type MenuGroup = 'work' | 'field' | 'startup' | 'mgmt' | 'config'
export const MENU_GROUPS: readonly MenuGroup[] = ['work', 'field', 'startup', 'mgmt', 'config']

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
  group?: MenuGroup
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

/** Ítems del proyecto por grupo fijo (orden = orden en el menú y en las listas planas). */
export const PROJECT_ITEMS: readonly MenuItemDef[] = [
  // Trabajo: acceso estable a lo de todos los días, en cualquier fase (A19).
  { key: 'systems', href: '/projects/{p}/systems', labelKey: 'systems', audience: ['lead', 'plan', 'mgmt'], group: 'work' },
  { key: 'tags', href: '/projects/{p}/tags', labelKey: 'tags', audience: ['field', 'lead', 'mgmt'], group: 'work' },
  { key: 'itrs', href: '/projects/{p}/itrs', labelKey: 'itrs', audience: ['field', 'lead', 'mgmt'], group: 'work' },
  { key: 'punches', href: '/projects/{p}/punches', labelKey: 'punchList', audience: ['field', 'lead', 'mgmt', 'client'], group: 'work' },
  // N2d: los P&ID son documentos (Documentos › P&ID con visor).
  { key: 'documents', href: '/projects/{p}/documents', labelKey: 'documents', audience: ['lead', 'mgmt', 'client'], group: 'work' },
  // Campo y cierre
  { key: 'preservation', href: '/projects/{p}/preservation', labelKey: 'preservation', audience: ['field', 'lead', 'mgmt'], group: 'field', badge: 'preservation' },
  { key: 'registers', href: '/projects/{p}/registers', labelKey: 'registers', audience: ['field', 'lead', 'mgmt'], group: 'field' },
  { key: 'certificates', href: '/projects/{p}/certificates', labelKey: 'certificates', audience: ['lead', 'mgmt', 'client'], group: 'field' },
  { key: 'pssr', href: '/projects/{p}/pssr', labelKey: 'pssr', audience: ['lead', 'mgmt', 'client'], group: 'field' },
  // N2c: un solo ítem para el hub (pestañas Señales · Lazos · Matrices C&E · Importar).
  { key: 'signals', href: '/projects/{p}/signals', labelKey: 'instrumentation', audience: ['mgmt'], group: 'field',
    also: ['/projects/{p}/loops', '/projects/{p}/ce-matrices', '/projects/{p}/import-signals'] },
  // Arranque y operación
  { key: 'startup', href: '/projects/{p}/startup', labelKey: 'startup', audience: ['field', 'lead', 'mgmt'], group: 'startup',
    notUnder: ['/projects/{p}/startup/performance', '/projects/{p}/startup/operations'] },
  { key: 'performance', href: '/projects/{p}/startup/performance', labelKey: 'performance', audience: ['mgmt', 'client'], group: 'startup' },
  { key: 'operations', href: '/projects/{p}/startup/operations', labelKey: 'operations', audience: ['mgmt', 'client'], group: 'startup' },
  // Gestión
  { key: 'daily', href: '/projects/{p}/daily', labelKey: 'daily', audience: ['lead', 'plan', 'mgmt', 'client'], group: 'mgmt' },
  // N2c: Planificación = look-ahead de gates + planes de trabajo (pestañas por ruta).
  { key: 'planning', href: '/projects/{p}/planning/lookahead', labelKey: 'planning', audience: ['plan', 'mgmt'], group: 'mgmt',
    also: ['/projects/{p}/work-plans', '/projects/{p}/planning'] },
  { key: 'kpis', href: '/projects/{p}/kpis', labelKey: 'kpis', audience: ['plan', 'mgmt'], group: 'mgmt' },
  // Configuración del proyecto (plegada)
  { key: 'scope', href: '/projects/{p}/scope', labelKey: 'scope', audience: ['plan', 'mgmt'], group: 'config' },
  { key: 'vendors', href: '/projects/{p}/vendors', labelKey: 'vendors', audience: ['lead', 'mgmt'], group: 'config' },
  { key: 'signatories', href: '/projects/{p}/signatories', labelKey: 'signatories', audience: ['mgmt'], group: 'config' },
  { key: 'import', href: '/projects/{p}/import', labelKey: 'import', tier: 'privileged', audience: ['mgmt'], group: 'config' },
]

/** Portafolio (organización). Lo que no es de su audiencia va a «Más…». */
export const PORTFOLIO_ITEMS: readonly MenuItemDef[] = [
  // exact: dentro de un proyecto (/projects/…) no se marca «Proyectos», que es la lista.
  { key: 'projects', href: '/projects', labelKey: 'projects', audience: ['mgmt'], exact: true },
  // El cliente entra al Portafolio (homeForRole): la entrada tiene que estar en su menú, no en «Más…»
  { key: 'dashboard', href: '/dashboard', labelKey: 'dashboard', audience: ['plan', 'mgmt', 'client'] },
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

/** Cómo se pintan las fases de la org: una sección plegable por fase (gerencia) o todas juntas en «Por fase» (líder). */
export type PhaseMode = 'each' | 'together' | null

export type MenuModel = {
  audience: Audience
  personal: MenuLink[]
  /** Arriba del proyecto (Resumen, Liberación…) o, en las audiencias de lista plana, todo el proyecto. */
  project: MenuLink[]
  /** Grupos fijos con encabezado (gerencia y líder). */
  groups: { group: Exclude<MenuGroup, 'config'>; items: MenuLink[] }[]
  /** «Configuración del proyecto», plegada (gerencia y líder). */
  config: MenuLink[]
  phaseMode: PhaseMode
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
  let groups: MenuModel['groups'] = []
  let config: MenuLink[] = []
  let phaseMode: PhaseMode = null
  if (projectId) {
    const top = PROJECT_TOP.filter(ok)
    const items = PROJECT_ITEMS.filter(ok)
    if (audience === 'mgmt' || audience === 'lead') {
      // Gerencia ve todo lo permitido; el líder, lo de su audiencia (el resto, en «Más…»).
      const shown = audience === 'mgmt' ? items : items.filter(mine)
      project = (audience === 'mgmt' ? top : top.filter(mine)).map(i => link(i, projectId))
      groups = (['work', 'field', 'startup', 'mgmt'] as const)
        .map(group => ({ group, items: shown.filter(i => i.group === group).map(i => link(i, projectId)) }))
        .filter(g => g.items.length > 0)
      config = shown.filter(i => i.group === 'config').map(i => link(i, projectId))
      phaseMode = audience === 'mgmt' ? 'each' : 'together'
      if (audience === 'lead') more.push(...top.filter(i => !mine(i)).map(i => link(i, projectId)), ...items.filter(i => !mine(i)).map(i => link(i, projectId)))
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
  return { audience, personal, project, groups, config, phaseMode, portfolio, more, admin }
}

/**
 * Entradas visibles sin desplegar nada: cada plegable cuenta como una («Configuración», «Por fase»). «Más…» y
 * Administración no cuentan. Las secciones por fase de gerencia dependen de la org y no entran aquí.
 */
export function visibleEntries(m: MenuModel): number {
  return m.personal.length + m.project.length + m.groups.reduce((n, g) => n + g.items.length, 0)
    + (m.config.length > 0 ? 1 : 0) + (m.phaseMode === 'together' ? 1 : 0) + m.portfolio.length
}

/** Una fase de la org en el menú (A19 · C): su gate, cuántos sistemas lo tienen liberado y el código de la fase. */
export type MenuPhase = { gateId: string; gateCode: string; gateName: string; phaseCode: string; approved: number; total: number }

/** Atajos de una fase: las listas de siempre, ya filtradas por esa fase (nunca un módulo aparte). */
export function phaseShortcuts(projectId: string, p: MenuPhase): { key: 'phaseItrs' | 'phasePunches' | 'phaseReadiness'; href: string }[] {
  const code = encodeURIComponent(p.phaseCode)
  return [
    { key: 'phaseItrs', href: `/projects/${projectId}/itrs?phase=${code}` },
    { key: 'phasePunches', href: `/projects/${projectId}/punches?phase=${code}` },
    { key: 'phaseReadiness', href: `/projects/${projectId}/readiness?gate=${encodeURIComponent(p.gateCode)}` },
  ]
}

/**
 * Fase abierta por defecto (D2): la liberación siguiente de más sistemas; en empate, la que va primero. Sin sistemas
 * pendientes, ninguna. `nextGateIds` = id del siguiente gate de cada sistema (`nextGate` de la matriz).
 */
export function pickOpenPhase(phases: readonly MenuPhase[], nextGateIds: readonly (string | null)[]): string | null {
  const count = new Map<string, number>()
  for (const id of nextGateIds) if (id) count.set(id, (count.get(id) ?? 0) + 1)
  let best: string | null = null
  let bestN = 0
  for (const p of phases) {
    const n = count.get(p.gateId) ?? 0
    if (n > bestN) { best = p.gateId; bestN = n }
  }
  return best
}
