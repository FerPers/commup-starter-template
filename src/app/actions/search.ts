'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { toHits, type SearchHit, type SearchRow } from '@/lib/search/catalog'

// N3a: búsqueda global ⌘K. La RPC search_everything es SECURITY INVOKER (RLS del usuario) y se limita a la org de
// la sesión; el proyecto, si viene, se verifica contra esa org (guard).
export const searchEverything = withAuth(
  { guards: [{ resource: 'project', field: 'projectId', optional: true }] },
  async (ctx, input: { q: string; projectId?: string | null }): Promise<{ hits?: SearchHit[]; error?: string }> => {
    const q = (input.q ?? '').trim().slice(0, 80)
    if (q.length < 2) return { hits: [] }
    const [{ data, error }, { data: projects }] = await Promise.all([
      ctx.supabase.rpc('search_everything', { p_q: q, p_org_id: ctx.orgId, p_project_id: input.projectId ?? undefined, p_limit: 6 }),
      // bounded: proyectos de la org (decenas)
      ctx.supabase.from('projects').select('id, code').eq('org_id', ctx.orgId).limit(500),
    ])
    if (error) return { error: error.message }
    const codes = new Map((projects ?? []).map(p => [p.id, p.code]))
    return { hits: toHits((data ?? []) as SearchRow[], id => codes.get(id)) }
  },
)
