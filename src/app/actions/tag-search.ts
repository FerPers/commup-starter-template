'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { normalizeSearch } from '@/lib/list/params'

export type TagSearchHit = {
  id: string
  tag_number: string
  description: string
  disciplines: { code: string; name: string; color: string } | null
}

/**
 * Búsqueda de tags para selectores (crear punch, etc.). Sprint E: reemplaza
 * pasar la lista completa de tags del proyecto al cliente. Máximo 50 resultados.
 */
export const searchProjectTags = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; q: string },
  ): Promise<{ error?: string; tags?: TagSearchHit[] }> => {
    const search = normalizeSearch(input.q)
    let query = ctx.supabase
      .from('tags')
      .select('id, tag_number, description, disciplines(code, name, color)')
      .eq('project_id', input.projectId)
      .order('tag_number')
      .limit(50)
    if (search) query = query.or(`tag_number.ilike.%${search}%,description.ilike.%${search}%`)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { tags: (data ?? []) as unknown as TagSearchHit[] }
  },
)
