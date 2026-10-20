import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { toMyCapacities, type MyCapacities } from '@/lib/constants/capacities'

// S14 (D14): capacidades efectivas del usuario en uno o varios proyectos (RPC my_capacities: designado o respaldo).

export async function loadMyCapacities(db: SupabaseClient<Database>, projectId: string): Promise<MyCapacities> {
  const { data } = await db.rpc('my_capacities', { p_project_id: projectId })
  return toMyCapacities(data)
}

export async function loadMyCapacitiesByProject(db: SupabaseClient<Database>, projectIds: string[]): Promise<Map<string, MyCapacities>> {
  const ids = [...new Set(projectIds)]
  const entries = await Promise.all(ids.map(async id => [id, await loadMyCapacities(db, id)] as const))
  return new Map(entries)
}
