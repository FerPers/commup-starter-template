import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

// N3b: el tag que llega por `?tag=` a una página de alta (desde ＋ Crear en su ficha). Solo si es de ese proyecto.
export type TagContext = {
  id: string
  tagNumber: string
  description: string | null
  discipline: { code: string; name: string; color: string } | null
  subsystemCode: string | null
  systemId: string | null
  systemCode: string | null
}

export async function loadTagContext(supabase: SupabaseClient<Database>, projectId: string, tagId: string | null | undefined): Promise<TagContext | null> {
  if (!tagId || !/^[0-9a-f-]{36}$/i.test(tagId)) return null
  const { data } = await supabase.from('tags')
    .select('id, tag_number, description, disciplines(code, name, color), subsystems(code, systems(id, code))')
    .eq('id', tagId).eq('project_id', projectId).maybeSingle()
  if (!data) return null
  const sub = data.subsystems as { code: string; systems: { id: string; code: string } | null } | null
  return {
    id: data.id,
    tagNumber: data.tag_number,
    description: data.description,
    discipline: (data.disciplines as { code: string; name: string; color: string } | null) ?? null,
    subsystemCode: sub?.code ?? null,
    systemId: sub?.systems?.id ?? null,
    systemCode: sub?.systems?.code ?? null,
  }
}
