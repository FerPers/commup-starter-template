/**
 * Migas de pan (N0, H-06): función pura que convierte la ruta en migas con claves de traducción.
 * - `nav:<clave>` = etiqueta del menú (Sidebar.nav), así miga = menú = título.
 * - `entity:<clave>` = un elemento concreto (Tag, ITR, Sistema…) cuando el segmento es un id.
 * - `sub:<clave>` = subpáginas sin ítem de menú (Nuevo, Look-ahead…).
 * Las colecciones sin página propia (p. ej. `/startup/runs`) no generan miga: así nunca se enlaza a un 404.
 */

export type Crumb = { label: string; href?: string; projectName?: true }

/** Segmentos que son un id (uuid u otro identificador opaco). */
export function isIdSegment(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^\d+$/.test(s)
}

const TOP: Record<string, string> = {
  dashboard: 'nav:dashboard', projects: 'nav:projects', itrs: 'nav:allItrs', 'punch-list': 'nav:allPunches', preservation: 'nav:preservation',
  'work-plans': 'nav:allWorkPlans', 'control-tower': 'nav:dashboard', kpis: 'nav:kpis', certificates: 'nav:allCertificates', scan: 'nav:scan',
  'my-work': 'nav:myWork', inbox: 'nav:inbox', home: 'nav:myWork', ayuda: 'sub:help', ops: 'nav:opsPunches', tag_360: 'entity:tag', r: 'entity:register',
}

const ADMIN: Record<string, string> = {
  templates: 'nav:itrTemplates', config: 'nav:config', users: 'nav:users', workflows: 'nav:workflows', 'api-keys': 'nav:apiKeys', webhooks: 'nav:webhooks',
  notifications: 'nav:notifications', 'data-quality': 'nav:dataQuality', audit: 'nav:auditLog', handover: 'nav:handover', gates: 'nav:gates',
  registers: 'nav:registerTypes', 'test-equipment': 'nav:testEquipment', companies: 'nav:companies',
}

const PROJECT: Record<string, string> = {
  systems: 'nav:systems', tags: 'nav:tags', itrs: 'nav:itrs', punches: 'nav:punchList', registers: 'nav:registers', daily: 'nav:daily',
  readiness: 'nav:readiness', planning: 'nav:planning', startup: 'nav:startup', documents: 'nav:documents', vendors: 'nav:vendors', signatories: 'nav:signatories', scope: 'nav:scope', certificates: 'nav:certificates',
  kpis: 'nav:kpis', signals: 'nav:signals', loops: 'nav:loops', 'ce-matrices': 'nav:ceMatrices', 'pid-documents': 'nav:pidDocuments',
  explorer: 'nav:explorer', twin: 'nav:twin', 'work-plans': 'nav:workPlans', pssr: 'nav:pssr', import: 'nav:import', 'import-signals': 'sub:importSignals',
  preservation: 'nav:preservation', interlocks: 'nav:ceMatrices',
}

/** Subpáginas con nombre propio (cualquier nivel por debajo de la sección). */
const SUB: Record<string, string> = {
  performance: 'nav:performance', operations: 'sub:operations', events: 'sub:events', lookahead: 'sub:lookahead', handovers: 'sub:handovers',
  reports: 'sub:reports', new: 'sub:new', generate: 'sub:generate', requirements: 'sub:requirements', report: 'sub:report', 'test-packs': 'sub:testPacks', import: 'sub:import',
  constraints: 'sub:constraints', tqs: 'sub:tqs', decisions: 'sub:decisions', lineups: 'sub:lineups',
  viewer: 'sub:viewer', preview: 'sub:preview', translations: 'sub:translations', backup: 'sub:backup', matrix: 'sub:matrix', pssr: 'nav:pssrTemplates',
  preservation: 'nav:preservationTemplates', punches: 'nav:opsPunches',
}

/** Colecciones sin página índice: no son miga; el id que sigue toma su etiqueta de entidad. */
const NO_INDEX = new Set(['runs', 'procedures', 'transfers', 'itrs@tag', 'preservation@tag', 'action', 'constraint', 'tq', 'decision'])

/** Qué es el id que sigue a una colección. */
const ENTITY: Record<string, string> = {
  tags: 'tag', itrs: 'itr', punches: 'punch', systems: 'system', runs: 'run', lineups: 'lineup', procedures: 'procedure', transfers: 'transfer', events: 'event',
  performance: 'test', documents: 'document', vendors: 'package', pssr: 'pssr', certificates: 'certificate', registers: 'register', reports: 'report',
  handovers: 'handover', 'ce-matrices': 'matrix', 'pid-documents': 'pid', preservation: 'plan', 'control-tower': 'system', templates: 'template',
  action: 'action', constraint: 'constraint', tq: 'tq', decision: 'decision', r: 'register', tag_360: 'tag',
}

export function buildCrumbs(pathname: string): Crumb[] {
  const seg = pathname.split('?')[0].split('/').filter(Boolean)
  if (seg.length === 0) return []
  const out: Crumb[] = []
  const href = (i: number) => '/' + seg.slice(0, i + 1).join('/')
  let start = 0

  if (seg[0] === 'projects' && seg[1]) {
    out.push({ label: 'nav:projects', href: '/projects' }, { label: seg[1], href: href(1), projectName: true })
    if (seg[2]) out.push({ label: PROJECT[seg[2]] ?? 'sub:detail', href: href(2) })
    start = 3
  } else if (seg[0] === 'admin') {
    out.push({ label: 'sub:admin' })
    if (seg[1]) out.push({ label: ADMIN[seg[1]] ?? 'sub:detail', href: href(1) })
    start = 2
  } else {
    out.push({ label: TOP[seg[0]] ?? 'sub:detail', href: href(0) })
    start = 1
  }

  for (let i = start; i < seg.length; i++) {
    const s = seg[i]
    const prev = seg[i - 1]
    if (s === 'pdf' || s === 'export') continue
    if (isIdSegment(s)) {
      // Intento de una prueba de desempeño (performance/runs/<id>) frente a ejecución de procedimiento (startup/runs/<id>).
      const kind = prev === 'runs' && seg[i - 2] === 'performance' ? 'attempt' : ENTITY[prev] ?? 'detail'
      out.push({ label: `entity:${kind}`, href: href(i) })
      continue
    }
    const scoped = (s === 'itrs' || s === 'preservation') && isIdSegment(prev) && seg[i - 2] === 'tags' ? `${s}@tag` : s
    if (NO_INDEX.has(scoped) || (s === 'runs' && seg[i - 1] === 'performance')) continue
    const label = SUB[s]
    if (label) out.push({ label, href: href(i) })
  }

  // La última miga es la página actual: sin enlace.
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], href: undefined }
  return out
}
