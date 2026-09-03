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
      const rows = await fetchPunchRowsAll(ctx.supabase, { orgId: ctx.orgId, projectId: input.projectId }, input.filters)
      return { rows }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al exportar' }
    }
  },
)
