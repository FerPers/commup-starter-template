import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { normalizeSearch, rangeFor, LIST_PAGE_SIZE, type SortDir } from './params'

type Client = SupabaseClient<Database>

export const TAG_SORT_KEYS = ['tag_number', 'description', 'status', 'created_at', 'subsystem_code'] as const
export type TagSortKey = typeof TAG_SORT_KEYS[number]

export type TagListFilters = { disc?: string; q?: string; subsystem?: string; status?: string }

/** Fila plana de tag_list_v */
export type TagListRow = {
  id: string
  tag_number: string
  description: string
  status: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  pid_drawing: string | null
  discipline_id: string
  discipline_code: string
  discipline_name: string
  discipline_color: string
  equipment_type_code: string | null
  equipment_type_name: string | null
  subsystem_id: string
  subsystem_code: string | null
  subsystem_name: string | null
  system_id: string | null
  system_code: string | null
  system_name: string | null
  area_id: string | null
  area_code: string | null
  area_name: string | null
}

export type TagDisciplineCount = { code: string; name: string; color: string; n: number }

const VIEW_COLS =
  'id, tag_number, description, status, manufacturer, model, serial_number, preservation_required, pid_drawing, ' +
  'discipline_id, discipline_code, discipline_name, discipline_color, equipment_type_code, equipment_type_name, ' +
  'subsystem_id, subsystem_code, subsystem_name, system_id, system_code, system_name, area_id, area_code, area_name'

const TAG_STATUSES = ['not_started', 'in_progress', 'complete', 'on_hold']

type FilterQ = { eq: (c: string, v: string) => FilterQ; or: (f: string) => FilterQ }

function applyFilters<Q extends FilterQ>(query: Q, projectId: string, f: TagListFilters): Q {
  let q = query.eq('project_id', projectId) as Q
  if (f.subsystem) q = q.eq('subsystem_id', f.subsystem) as Q
  if (f.disc) q = q.eq('discipline_code', f.disc) as Q
  if (f.status && TAG_STATUSES.includes(f.status)) q = q.eq('status', f.status) as Q
  const search = normalizeSearch(f.q)
  if (search) {
    // Sprint E: columnas propias de tags (índices trigram) en vez de search_text concatenado
    const like = `%${search}%`
    q = q.or(`tag_number.ilike.${like},description.ilike.${like},manufacturer.ilike.${like},model.ilike.${like},pid_drawing.ilike.${like}`) as Q
  }
  return q
}

export async function fetchTagPage(
  supabase: Client,
  projectId: string,
  opts: { filters: TagListFilters; page: number; sort: TagSortKey; dir: SortDir; pageSize?: number },
): Promise<{ rows: TagListRow[]; total: number }> {
  const size = opts.pageSize ?? LIST_PAGE_SIZE
  const [from, to] = rangeFor(opts.page, size)
  const base = supabase.from('tag_list_v').select(VIEW_COLS, { count: 'exact' })
  const { data, count, error } = await applyFilters(base, projectId, opts.filters)
    .order(opts.sort, { ascending: opts.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as unknown as TagListRow[], total: count ?? 0 }
}

export async function fetchTagDisciplineCounts(
  supabase: Client,
  projectId: string,
  subsystemId?: string,
): Promise<TagDisciplineCount[]> {
  const { data } = await supabase.rpc('tag_discipline_counts', {
    p_project_id: projectId,
    p_subsystem_id: (subsystemId ?? '').length > 0 ? subsystemId : undefined,
  })
  return ((data ?? []) as Array<{ discipline_code: string; discipline_name: string; discipline_color: string; n: number }>)
    .map(r => ({ code: r.discipline_code, name: r.discipline_name, color: r.discipline_color, n: Number(r.n) }))
}
