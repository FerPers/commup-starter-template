import { getActiveMembership } from '@/lib/supabase/membership'
import { buildPunchListWorkbook } from '@/lib/excel/punch-list'
import { loadPunchExportRows } from '@/lib/excel/punch-export'
import { punchFiltersFromSearch } from '@/lib/list/punch-filters'
import { TruncatedError } from '@/lib/list/fetch-all'

export const dynamic = 'force-dynamic'

// Excel del proyecto con los filtros de la lista (G-14).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: project } = await supabase
    .from('projects')
    .select('id, code')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const filters = { ...punchFiltersFromSearch(new URL(req.url).searchParams, ctx.userId), project: undefined }
  let bytes: Uint8Array
  try {
    const rows = await loadPunchExportRows(supabase, { orgId, projectId }, filters)
    bytes = buildPunchListWorkbook(rows, { includeProjectCol: false })
  } catch (e) {
    if (e instanceof TruncatedError) return new Response(e.message, { status: 413 })
    throw e
  }
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-punch-list-${today}.xlsx`

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
