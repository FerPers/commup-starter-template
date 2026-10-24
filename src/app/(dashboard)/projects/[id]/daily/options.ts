import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { Options } from './forms'

// Opciones de los formularios de gestión diaria: miembros de la org, sistemas del proyecto,
// gates activos y disciplinas de la org (todo limitado por RLS).
export async function loadOptions(db: SupabaseClient<Database>, orgId: string, projectId: string): Promise<Options & { names: Record<string, string> }> {
  const [{ data: members }, { data: systems }, { data: gates }, { data: disciplines }] = await Promise.all([
    db.from('org_members').select('user_id, profiles(full_name)').eq('org_id', orgId),
    db.from('systems').select('id, code, name').eq('project_id', projectId).order('code'),
    db.from('readiness_gates').select('id, code, name').eq('org_id', orgId).eq('is_active', true).order('order_index'),
    db.from('disciplines').select('id, code, name').eq('org_id', orgId).order('code'),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles
    names[m.user_id] = p?.full_name?.trim() ? p.full_name : '—'
  }
  return {
    names,
    members: Object.entries(names).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    systems: systems ?? [],
    gates: gates ?? [],
    disciplines: disciplines ?? [],
  }
}
