import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { normalizeSearch, rangeFor, LIST_PAGE_SIZE, type SortDir } from './params'
import type { ItrListRow, ItrListFilters, ItrSortKey, ItrStatusCounts } from './itr-types'

type Client = SupabaseClient<Database>

const VIEW_COLS =
  'id, itr_number, status, progress_pct, scheduled_date, created_at, project_id, project_name, project_code, ' +
  'tag_id, tag_number, tag_description, template_code, template_title, ' +
  'discipline_code, discipline_name, discipline_color, phase_code, phase_name, phase_color'

const ITR_STATUSES = ['not_started', 'in_progress', 'completed', 'approved', 'rejected']

type FilterQ = { eq: (c: string, v: string) => FilterQ; or: (f: string) => FilterQ }

function applyFilters<Q extends FilterQ>(
  query: Q,
  scope: { orgId: string; projectId?: string },
  f: ItrListFilters,
  searchIds: { tagIds: string[]; templateIds: string[] } | null,
): Q {
  let q = query.eq('org_id', scope.orgId) as Q
  if (scope.projectId) q = q.eq('project_id', scope.projectId) as Q
  else if (f.project) q = q.eq('project_id', f.project) as Q
  if (f.status && ITR_STATUSES.includes(f.status)) q = q.eq('status', f.status) as Q
  if (f.phase) q = q.eq('phase_code', f.phase) as Q
  if (f.disc) q = q.eq('discipline_code', f.disc) as Q
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

/** Resuelve ids de tags y plantillas que coinciden con la búsqueda (acotado) */
async function resolveSearchIds(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  search: string,
): Promise<{ tagIds: string[]; templateIds: string[] }> {
  const like = `%${search}%`
  let tagQ = supabase.from('tags').select('id').or(`tag_number.ilike.${like},description.ilike.${like}`).limit(150)
  if (scope.projectId) tagQ = tagQ.eq('project_id', scope.projectId)
  const [{ data: tags }, { data: templates }] = await Promise.all([
    tagQ,
    supabase.from('itr_templates').select('id').eq('org_id', scope.orgId).or(`code.ilike.${like},title.ilike.${like}`).limit(100),
  ])
  return { tagIds: (tags ?? []).map(t => t.id), templateIds: (templates ?? []).map(t => t.id) }
}

/**
 * Una página de ITRs desde la vista paginable + asignaciones/firmas solo de
 * esa página. `count` es el total con los filtros aplicados.
 */
export async function fetchItrPage(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  opts: { filters: ItrListFilters; page: number; sort: ItrSortKey; dir: SortDir; pageSize?: number },
): Promise<{ rows: ItrListRow[]; total: number }> {
  const size = opts.pageSize ?? LIST_PAGE_SIZE
  const [from, to] = rangeFor(opts.page, size)

  const search = normalizeSearch(opts.filters.q)
  const searchIds = search ? await resolveSearchIds(supabase, scope, search) : null
  const base = supabase.from('itr_list_v').select(VIEW_COLS, { count: 'exact' })
  const { data, count, error } = await applyFilters(base, scope, opts.filters, searchIds)
    .order(opts.sort, { ascending: opts.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<Omit<ItrListRow, 'assignments' | 'signatures'>>
  const ids = rows.map(r => r.id)
  const [assignRes, sigRes] = ids.length === 0
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from('itr_assignments').select('itr_id, user_id, role, profiles(full_name)').in('itr_id', ids),
        supabase.from('itr_signatures').select('itr_id, role, signed_at').in('itr_id', ids),
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

  return {
    rows: rows.map(r => ({
      ...r,
      progress_pct: Number(r.progress_pct ?? 0),
      assignments: assignments.get(r.id) ?? [],
      signatures: signatures.get(r.id) ?? [],
    })),
    total: count ?? 0,
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
  for (let page = 1; out.length < maxRows; page++) {
    const { rows } = await fetchItrPage(supabase, scope, { filters, page, sort: 'itr_number', dir: 'asc', pageSize: batch })
    out.push(...rows)
    if (rows.length < batch) break
  }
  return out.slice(0, maxRows)
}
