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

export type PidTagHit = {
  id: string; tag_number: string; description: string; status: string
  discipline: { id: string; code: string; name: string; color: string }
  system: { id: string; code: string; name: string; color: string } | null
}

const PID_TAG_PAGE = 30

type PidTagRow = {
  id: string; tag_number: string; description: string | null; status: string
  disciplines: { id: string; code: string; name: string; color: string } | null
  subsystems: { systems: { id: string; code: string; name: string; color: string } | null } | null
}

/**
 * P1: selector de tags del editor de pines del P&ID. Antes la página cargaba todos los tags del proyecto (hasta
 * 50 mil) para filtrarlos en el cliente; ahora busca en el servidor por páginas de 30 (`offset`).
 */
export const searchPidTags = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; q: string; offset?: number },
  ): Promise<{ error?: string; tags?: PidTagHit[]; hasMore?: boolean }> => {
    const search = normalizeSearch(input.q)
    const offset = Math.max(0, Math.min(Math.trunc(input.offset ?? 0), 100_000))
    let query = ctx.supabase
      .from('tags')
      .select('id, tag_number, description, status, disciplines:discipline_id(id, code, name, color), subsystems:subsystem_id(systems:system_id(id, code, name, color))')
      .eq('project_id', input.projectId)
      .order('tag_number')
      .order('id')
      .range(offset, offset + PID_TAG_PAGE) // una de más: dice si hay otra página
    if (search) query = query.or(`tag_number.ilike.%${search}%,description.ilike.%${search}%`)
    const { data, error } = await query
    if (error) return { error: error.message }
    const rows = (data ?? []) as unknown as PidTagRow[]
    return {
      hasMore: rows.length > PID_TAG_PAGE,
      tags: rows.slice(0, PID_TAG_PAGE).map(t => ({
        id: t.id,
        tag_number: t.tag_number,
        description: t.description ?? '',
        status: t.status,
        discipline: {
          id: t.disciplines?.id ?? '',
          code: t.disciplines?.code ?? '??',
          name: t.disciplines?.name ?? '',
          color: t.disciplines?.color ?? '#94a3b8',
        },
        system: t.subsystems?.systems ?? null,
      })),
    }
  },
)
