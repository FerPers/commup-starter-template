'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { fetchPunchRowsAll, type PunchListFilters, type PunchListRow } from '@/lib/list/punch-query'

/** Exportación CSV de punches con los filtros vigentes (lotes de 1000, tope 20k) */
export const exportPunchList = withAuth(
  { guards: [{ resource: 'project', field: 'projectId', optional: true }] },
  async (
    ctx,
    input: { projectId?: string; filters: PunchListFilters },
  ): Promise<{ error?: string; rows?: PunchListRow[] }> => {
    try {
      // N0 (H-19): «me» = la persona en sesión (el resto de ids se ignora: solo se exporta lo propio o todo).
      const filters = { ...input.filters, assigned: input.filters.assigned === 'me' ? ctx.userId : undefined }
      const rows = await fetchPunchRowsAll(ctx.supabase, { orgId: ctx.orgId, projectId: input.projectId }, filters)
      return { rows }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al exportar' }
    }
  },
)
