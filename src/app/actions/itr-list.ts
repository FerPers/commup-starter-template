'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { fetchItrRowsAll } from '@/lib/list/itr-query'
import type { ItrListFilters, ItrListRow } from '@/lib/list/itr-types'

/**
 * Exportación de la lista de ITRs con los filtros vigentes (Sprint E).
 * Recorre la vista en lotes de 1000 (límite de PostgREST) hasta 20.000 filas.
 */
export const exportItrList = withAuth(
  { guards: [{ resource: 'project', field: 'projectId', optional: true }] },
  async (
    ctx,
    input: { projectId?: string; filters: ItrListFilters },
  ): Promise<{ error?: string; rows?: ItrListRow[] }> => {
    try {
      const rows = await fetchItrRowsAll(
        ctx.supabase,
        { orgId: ctx.orgId, projectId: input.projectId },
        input.filters,
      )
      return { rows }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al exportar' }
    }
  },
)
