import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { TruncatedError } from './fetch-all'
import { normalizeSearch, rangeFor, LIST_PAGE_SIZE, type SortDir } from './params'
import type { ItrListRow, ItrListFilters, ItrSortKey, ItrStatusCounts } from './itr-types'

type Client = SupabaseClient<Database>

const VIEW_COLS =
  'id, itr_number, status, progress_pct, scheduled_date, created_at, project_id, project_name, project_code, ' +
  'tag_id, tag_number, tag_description, template_code, template_title, ' +
  'discipline_code, discipline_name, discipline_color, phase_code, phase_name, phase_color'

const ITR_STATUSES = ['not_started', 'in_progress', 'completed', 'approved', 'rejected']

type FilterQ = { eq: (c: string, v: string) => FilterQ; or: (f: string) => FilterQ; contains: (c: string, v: string[]) => FilterQ }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: string | undefined): v is string => !!v && UUID_RE.test(v)

function applyFilters<Q extends FilterQ>(
  query: Q,
  scope: { orgId: string; projectId?: string },
  f: ItrListFilters,
  searchIds: { tagIds: string[]; templateIds: string[] } | null,
  phaseIds: string[] | null,
): Q {
  let q = query.eq('org_id', scope.orgId) as Q
  if (scope.projectId) q = q.eq('project_id', scope.projectId) as Q
  else if (f.project) q = q.eq('project_id', f.project) as Q
  if (f.status && ITR_STATUSES.includes(f.status)) q = q.eq('status', f.status) as Q
  // S09 (B-22): la fase se filtra por phase_id (columna de itrs, indexada) y no por el código de la tabla unida
  if (phaseIds?.length) q = q.or(`phase_id.in.(${phaseIds.join(',')})`) as Q
  else if (f.phase) q = q.eq('phase_code', f.phase) as Q  // código inexistente → 0 filas
  if (f.disc) q = q.eq('discipline_code', f.disc) as Q
  // S19 (C-30): sistema / subsistema / área (columnas de itr_list_v) y responsable (assignee_ids).
  if (isUuid(f.system)) q = q.eq('system_id', f.system) as Q
  if (isUuid(f.subsystem)) q = q.eq('subsystem_id', f.subsystem) as Q
  if (isUuid(f.area)) q = q.eq('area_id', f.area) as Q
  if (f.assignee === 'none') q = q.eq('assignee_ids', '{}') as Q
  else if (isUuid(f.assignee)) q = q.contains('assignee_ids', [f.assignee]) as Q
  const search = normalizeSearch(f.q)
  if (search) {
    // Sprint E: ilike solo sobre columnas con índice trigram (itr_number) + ids
    // resueltos antes (tags/plantillas). Evita concatenar 250k filas por búsqueda.
    const parts = [`itr_number.ilike.%${search}%`]
    if (searchIds?.tagIds.length) parts.push(`tag_id.in.(${searchIds.tagIds.join(',')})`)
    if (searchIds?.templateIds.length) parts.push(`template_id.in.(${searchIds.templateIds.join(',')})`)
    q = q.or(parts.join(',')) as Q
  }
  return q
}

/** Tope de ids resueltos por búsqueda (cabe en la URL de PostgREST); al alcanzarlo el resultado es parcial. */
export const SEARCH_TAG_CAP = 150
const SEARCH_TEMPLATE_CAP = 100

/** Ids de las fases de la org con ese código (las fases son de la org, compartidas por sus proyectos). */
async function resolvePhaseIds(supabase: Client, orgId: string, code: string | undefined): Promise<string[] | null> {
  if (!code) return null
  const { data } = await supabase.from('project_phases').select('id').eq('org_id', orgId).eq('code', code)
  return (data ?? []).map(p => p.id)
}

/** Resuelve ids de tags y plantillas que coinciden con la búsqueda (acotado) */
async function resolveSearchIds(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  search: string,
): Promise<{ tagIds: string[]; templateIds: string[]; capped: boolean }> {
  const like = `%${search}%`
  let tagQ = supabase.from('tags').select('id').or(`tag_number.ilike.${like},description.ilike.${like}`).limit(SEARCH_TAG_CAP)
  if (scope.projectId) tagQ = tagQ.eq('project_id', scope.projectId)
  const [{ data: tags }, { data: templates }] = await Promise.all([
    tagQ,
    supabase.from('itr_templates').select('id').eq('org_id', scope.orgId).or(`code.ilike.${like},title.ilike.${like}`).limit(SEARCH_TEMPLATE_CAP),
  ])
  return {
    tagIds: (tags ?? []).map(t => t.id),
    templateIds: (templates ?? []).map(t => t.id),
    // B-22: más coincidencias que el tope → la lista de ITR puede no incluirlas todas
    capped: (tags ?? []).length >= SEARCH_TAG_CAP || (templates ?? []).length >= SEARCH_TEMPLATE_CAP,
  }
}

/**
 * Una página de ITRs desde la vista paginable + asignaciones/firmas solo de
 * esa página. `count` es el total con los filtros aplicados.
 */
export async function fetchItrPage(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  opts: { filters: ItrListFilters; page: number; sort: ItrSortKey; dir: SortDir; pageSize?: number },
): Promise<{ rows: ItrListRow[]; total: number; searchCapped: boolean }> {
  const size = opts.pageSize ?? LIST_PAGE_SIZE
  const [from, to] = rangeFor(opts.page, size)

  const search = normalizeSearch(opts.filters.q)
  const [searchIds, phaseIds] = await Promise.all([
    search ? resolveSearchIds(supabase, scope, search) : null,
    resolvePhaseIds(supabase, scope.orgId, opts.filters.phase),
  ])
  // bounded: .range(from, to) más abajo
  const base = supabase.from('itr_list_v').select(VIEW_COLS, { count: 'exact' })
  const { data, count, error } = await applyFilters(base, scope, opts.filters, searchIds, phaseIds)
    .order(opts.sort, { ascending: opts.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<Omit<ItrListRow, 'assignments' | 'signatures' | 'required_signatures'>>
  const ids = rows.map(r => r.id)
  const [assignRes, sigRes, reqRes] = ids.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from('itr_assignments').select('itr_id, user_id, role, profiles(full_name)').in('itr_id', ids),
        supabase.from('itr_signatures').select('itr_id, role, signed_at').in('itr_id', ids),
        // S04: firmas que exige cada ITR (la vista itr_list_v no las trae).
        supabase.from('itrs').select('id, required_signatures').in('id', ids),
      ])

  const assignments = new Map<string, ItrListRow['assignments']>()
  for (const a of (assignRes.data ?? []) as Array<{ itr_id: string; user_id: string; role: string; profiles: { full_name: string } | null }>) {
    const list = assignments.get(a.itr_id) ?? []
    list.push({ user_id: a.user_id, role: a.role, full_name: a.profiles?.full_name ?? null })
    assignments.set(a.itr_id, list)
  }
  const signatures = new Map<string, ItrListRow['signatures']>()
  for (const s of (sigRes.data ?? []) as Array<{ itr_id: string; role: string; signed_at: string }>) {
    const list = signatures.get(s.itr_id) ?? []
    list.push({ role: s.role, signed_at: s.signed_at })
    signatures.set(s.itr_id, list)
  }

  const required = new Map(((reqRes.data ?? []) as Array<{ id: string; required_signatures: string[] }>).map(r => [r.id, r.required_signatures]))

  return {
    rows: rows.map(r => ({
      ...r,
      progress_pct: Number(r.progress_pct ?? 0),
      assignments: assignments.get(r.id) ?? [],
      signatures: signatures.get(r.id) ?? [],
      required_signatures: required.get(r.id) ?? ['executor', 'supervisor'],
    })),
    total: count ?? 0,
    searchCapped: !!searchIds?.capped,
  }
}

/** Conteo por estado calculado en SQL (RPC security invoker) */
export async function fetchItrStatusCounts(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
): Promise<ItrStatusCounts> {
  const { data } = await supabase.rpc('itr_status_counts', {
    p_project_id: scope.projectId ?? undefined,
    p_org_id: scope.projectId ? undefined : scope.orgId,
  })
  const counts: ItrStatusCounts = {}
  for (const r of (data ?? []) as Array<{ status: string; n: number }>) counts[r.status] = Number(r.n)
  return counts
}

/**
 * Todas las filas que cumplen los filtros, en lotes de 1000 (límite de
 * PostgREST). Para exportaciones; tope duro para no agotar memoria en Workers.
 */
export async function fetchItrRowsAll(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  filters: ItrListFilters,
  maxRows = 20_000,
): Promise<ItrListRow[]> {
  const out: ItrListRow[] = []
  const batch = 1000
  for (let page = 1; out.length <= maxRows; page++) {
    const { rows } = await fetchItrPage(supabase, scope, { filters, page, sort: 'itr_number', dir: 'asc', pageSize: batch })
    out.push(...rows)
    if (rows.length < batch) return out
  }
  // S09 (B-08): antes devolvía las primeras maxRows sin avisar
  throw new TruncatedError(maxRows)
}
