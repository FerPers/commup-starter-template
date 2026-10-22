/**
 * R2a (plan referente, maquetas M aprobadas 2026-10-22): registro «Requisitos ITR». La fuente de verdad es SQL
 * (itr_generation_candidates = motor, tag_itr_requirements, tag_requirements_page, tag_requirements_summary);
 * aquí solo tipos, parámetros de la URL y el armado de la cadena A → B → C del tag. Tests en requirements.test.ts.
 */

export type ReqState = 'missing' | 'generated' | 'in_progress' | 'approved' | 'excluded' | 'outside'
export const REQ_STATES: readonly ReqState[] = ['missing', 'generated', 'in_progress', 'approved', 'excluded', 'outside']
export type ReqOrigin = 'matrix' | 'manual' | 'ai'

export type ReqChip = {
  code: string
  title: string | null
  state: ReqState
  origin: ReqOrigin | null
  itr_id: string | null
  phase: string | null
  reason: string | null
  /** R2b: código del cliente de la plantilla (proyecto > defecto de la org). */
  client_code?: string | null
}

export type ReqPageRow = {
  tag_id: string
  tag_number: string
  description: string | null
  type_code: string | null
  has_type: boolean
  reqs: ReqChip[]
}

export type ReqPage = { total: number; rows: ReqPageRow[] }

export type ReqSummary = {
  required: number
  generated: number
  in_progress: number
  approved: number
  missing: number
  excluded: number
  outside: number
  tags: number
  tags_no_type: number
  tags_no_rule: number
  proposed_rules: number
  by_subsystem: { subsystem_id: string | null; required: number; missing: number }[]
  by_discipline: { discipline_id: string | null; code: string | null; name: string | null; color: string | null; required: number; generated: number; approved: number; missing: number }[]
}

export const REQ_FILTERS = ['all', 'missing', 'notype', 'norule', 'excluded', 'outside'] as const
export type ReqFilter = (typeof REQ_FILTERS)[number]
export const REQ_PAGE_SIZE = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (v: string | undefined) => (v && UUID.test(v) ? v : undefined)

export type ReqParams = { filter: ReqFilter; area?: string; system?: string; subsystem?: string; q?: string; page: number }

/** Parámetros de la URL (`?filter=&area=&system=&subsystem=&q=&page=`); lo desconocido se ignora. */
export function parseReqParams(sp: Record<string, string | undefined>): ReqParams {
  const page = Number(sp.page)
  const q = sp.q?.trim()
  return {
    filter: (REQ_FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as ReqFilter) : 'all',
    area: id(sp.area), system: id(sp.system), subsystem: id(sp.subsystem),
    q: q ? q.slice(0, 80) : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

export function reqQuery(p: Partial<ReqParams>): string {
  const q = new URLSearchParams()
  if (p.filter && p.filter !== 'all') q.set('filter', p.filter)
  if (p.area) q.set('area', p.area)
  if (p.system) q.set('system', p.system)
  if (p.subsystem) q.set('subsystem', p.subsystem)
  if (p.q) q.set('q', p.q)
  if (p.page && p.page > 1) q.set('page', String(p.page))
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Un requisito cuenta (para «requeridos») si no está excluido ni es un ITR fuera de requisitos. */
export const isRequired = (s: ReqState) => s !== 'excluded' && s !== 'outside'

export type ChainColumn = { phase: string; chips: ReqChip[] }
export type ChainRow = { discipline: string; columns: ChainColumn[]; gaps: string[] }

/**
 * Cadena del tag por disciplina: una columna por fase (en el orden de `phaseOrder`), con los requisitos de cada fase.
 * `gaps` = fases sin requisito entre la primera y la última que sí tienen (p. ej. hay A y C pero falta B).
 * `disciplineOf(code)` da la disciplina del código (las fichas no la traen en el chip).
 */
export function buildChain(chips: ReqChip[], phaseOrder: readonly string[], disciplineOf: (chip: ReqChip) => string): ChainRow[] {
  const byDisc = new Map<string, ReqChip[]>()
  for (const c of chips) {
    const d = disciplineOf(c)
    if (!byDisc.has(d)) byDisc.set(d, [])
    byDisc.get(d)!.push(c)
  }
  return [...byDisc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([discipline, list]) => {
    const columns = phaseOrder.map(phase => ({ phase, chips: list.filter(c => c.phase === phase).sort((a, b) => a.code.localeCompare(b.code)) }))
    const counted = columns.map(c => c.chips.some(x => isRequired(x.state) || x.state === 'excluded'))
    const first = counted.indexOf(true)
    const last = counted.lastIndexOf(true)
    const gaps = first < 0 ? [] : columns.slice(first, last + 1).filter((_, i) => !counted[first + i]).map(c => c.phase)
    return { discipline, columns, gaps }
  })
}
