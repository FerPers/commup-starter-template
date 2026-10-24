import { getActiveMembership } from '@/lib/supabase/membership'
import { buildPunchListWorkbook } from '@/lib/excel/punch-list'
import { loadPunchExportRows } from '@/lib/excel/punch-export'
import { punchFiltersFromSearch } from '@/lib/list/punch-filters'
import { TruncatedError } from '@/lib/list/fetch-all'

export const dynamic = 'force-dynamic'

// Excel de «Todos los proyectos» con los filtros de la lista (G-14).
export async function GET(req: Request) {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const filters = punchFiltersFromSearch(new URL(req.url).searchParams, ctx.userId)
  try {
    const rows = await loadPunchExportRows(ctx.supabase, { orgId: ctx.orgId }, filters)
    const bytes = buildPunchListWorkbook(rows, { includeProjectCol: true })
    return excelResponse(bytes, `org-punch-list-${new Date().toISOString().slice(0, 10)}.xlsx`)
  } catch (e) {
    if (e instanceof TruncatedError) return new Response(e.message, { status: 413 })
    throw e
  }
}

function excelResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
