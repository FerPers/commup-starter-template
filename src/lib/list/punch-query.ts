import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { normalizeSearch, rangeFor, LIST_PAGE_SIZE, type SortDir } from './params'

type Client = SupabaseClient<Database>

export const PUNCH_SORT_KEYS = ['created_at', 'punch_number', 'category', 'status', 'priority', 'target_date', 'tag_number'] as const
export type PunchSortKey = typeof PUNCH_SORT_KEYS[number]

export type PunchListFilters = { cat?: string; status?: string; disc?: string; system?: string; q?: string; project?: string }

/** Fila plana de punch_list_v */
export type PunchListRow = {
  id: string
  project_id: string
  project_name: string
  project_code: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: 'critical' | 'major' | 'minor'
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  assigned_to: string | null
  raised_by: string
  raised_by_name: string | null
  assigned_to_name: string | null
  discipline_code: string | null
  discipline_name: string | null
  discipline_color: string | null
  tag_id: string | null
  tag_number: string | null
  tag_description: string | null
  subsystem_id: string
  subsystem_code: string | null
  subsystem_name: string | null
  system_code: string | null
  system_name: string | null
}

/** Conteos categoría×estado → tarjetas resumen */
export type PunchSummary = { catAOpen: number; catBOpen: number; catCOpen: number; closed: number; total: number }

const VIEW_COLS =
  'id, project_id, project_name, project_code, punch_number, category, description, status, priority, ' +
  'target_date, closed_date, created_at, itr_id, assigned_to, raised_by, raised_by_name, assigned_to_name, ' +
  'discipline_code, discipline_name, discipline_color, tag_id, tag_number, tag_description, ' +
  'subsystem_id, subsystem_code, subsystem_name, system_code, system_name'

const CATS = ['A', 'B', 'C']
const STATUSES = ['open', 'in_progress', 'closed', 'cancelled']

type FilterQ = { eq: (c: string, v: string) => FilterQ; or: (f: string) => FilterQ }

function applyFilters<Q extends FilterQ>(
  query: Q, scope: { orgId: string; projectId?: string }, f: PunchListFilters, tagIds: string[] | null,
): Q {
  let q = query.eq('org_id', scope.orgId) as Q
  if (scope.projectId) q = q.eq('project_id', scope.projectId) as Q
  else if (f.project) q = q.eq('project_id', f.project) as Q
  if (f.cat && CATS.includes(f.cat)) q = q.eq('category', f.cat) as Q
  if (f.status && STATUSES.includes(f.status)) q = q.eq('status', f.status) as Q
  if (f.disc) q = q.eq('discipline_code', f.disc) as Q
  if (f.system) q = q.eq('system_code', f.system) as Q
  const search = normalizeSearch(f.q)
  if (search) {
    const like = `%${search}%`
    const parts = [`punch_number.ilike.${like}`, `description.ilike.${like}`]
    if (tagIds?.length) parts.push(`tag_id.in.(${tagIds.join(',')})`)
    q = q.or(parts.join(',')) as Q
  }
  return q
}

async function resolveTagIds(supabase: Client, scope: { orgId: string; projectId?: string }, search: string): Promise<string[]> {
  let q = supabase.from('tags').select('id').ilike('tag_number', `%${search}%`).limit(150)
  if (scope.projectId) q = q.eq('project_id', scope.projectId)
  const { data } = await q
  return (data ?? []).map(t => t.id)
}

export async function fetchPunchPage(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  opts: { filters: PunchListFilters; page: number; sort: PunchSortKey; dir: SortDir; pageSize?: number },
): Promise<{ rows: PunchListRow[]; total: number }> {
  const size = opts.pageSize ?? LIST_PAGE_SIZE
  const [from, to] = rangeFor(opts.page, size)
  const search = normalizeSearch(opts.filters.q)
  const tagIds = search ? await resolveTagIds(supabase, scope, search) : null
  const base = supabase.from('punch_list_v').select(VIEW_COLS, { count: 'exact' })
  const { data, count, error } = await applyFilters(base, scope, opts.filters, tagIds)
    .order(opts.sort, { ascending: opts.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as unknown as PunchListRow[], total: count ?? 0 }
}

export async function fetchPunchSummary(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
): Promise<PunchSummary> {
  const { data } = await supabase.rpc('punch_summary_counts', {
    p_project_id: scope.projectId ?? undefined,
    p_org_id: scope.projectId ? undefined : scope.orgId,
  })
  const s: PunchSummary = { catAOpen: 0, catBOpen: 0, catCOpen: 0, closed: 0, total: 0 }
  for (const r of (data ?? []) as Array<{ category: string; status: string; n: number }>) {
    const n = Number(r.n)
    s.total += n
    if (r.status === 'closed') s.closed += n
    const open = r.status === 'open' || r.status === 'in_progress'
    if (open && r.category === 'A') s.catAOpen += n
    if (open && r.category === 'B') s.catBOpen += n
    if (open && r.category === 'C') s.catCOpen += n
  }
  return s
}

/** Todas las filas filtradas en lotes de 1000 (exportación), tope 20k */
export async function fetchPunchRowsAll(
  supabase: Client,
  scope: { orgId: string; projectId?: string },
  filters: PunchListFilters,
  maxRows = 20_000,
): Promise<PunchListRow[]> {
  const out: PunchListRow[] = []
  const batch = 1000
  for (let page = 1; out.length < maxRows; page++) {
    const { rows } = await fetchPunchPage(supabase, scope, { filters, page, sort: 'punch_number', dir: 'asc', pageSize: batch })
    out.push(...rows)
    if (rows.length < batch) break
  }
  return out.slice(0, maxRows)
}
