import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { fetchPunchRowsAll, type PunchListFilters } from '@/lib/list/punch-query'
import type { PunchExportRow } from './punch-list'

// G-14: el Excel de la lista de punch (proyecto y «Todos») sale de punch_list_v con los mismos filtros que la
// pantalla (antes exportaba todo; el CSV de «Todos» era el único que filtraba y se quitó).

export async function loadPunchExportRows(
  supabase: SupabaseClient<Database>,
  scope: { orgId: string; projectId?: string },
  filters: PunchListFilters,
): Promise<PunchExportRow[]> {
  const rows = await fetchPunchRowsAll(supabase, scope, filters)

  // La vista no trae el área: una consulta por lotes de sistemas (decenas a cientos).
  const systemIds = [...new Set(rows.map(r => r.system_id).filter((id): id is string => !!id))]
  const areaBySystem = new Map<string, string>()
  for (let i = 0; i < systemIds.length; i += 200) {
    const { data } = await supabase.from('systems').select('id, areas(code, name)').in('id', systemIds.slice(i, i + 200))
    for (const s of data ?? []) {
      const area = Array.isArray(s.areas) ? s.areas[0] : s.areas
      if (area) areaBySystem.set(s.id, `${area.code} — ${area.name}`)
    }
  }

  return rows.map(r => ({
    project: scope.projectId ? '' : r.project_code,
    punchNumber: r.punch_number,
    category: r.category,
    status: r.status,
    priority: r.priority,
    description: r.description,
    tagNumber: r.tag_number ?? '',
    discipline: r.discipline_code ?? '',
    area: (r.system_id ? areaBySystem.get(r.system_id) : undefined) ?? '',
    system: r.system_code ? `${r.system_code} — ${r.system_name ?? ''}` : '',
    subsystem: r.subsystem_code ? `${r.subsystem_code} — ${r.subsystem_name ?? ''}` : '',
    raisedBy: r.raised_by_name ?? '',
    assignedTo: r.assigned_to_name ?? '',
    targetDate: r.target_date ?? '',
    closedDate: r.closed_date ?? '',
    createdAt: r.created_at.slice(0, 10),
  }))
}
