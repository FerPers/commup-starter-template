/**
 * GET /api/v1/punches/post-handover — list Cat B punches live post-handover.
 *
 * Required scope: punches:read
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, parsePagination, apiDbError } from '@/lib/api/auth'
import { readQuery } from '@/lib/api/validate'
import { ProjectQuery } from '@/lib/api/schemas'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['punches:read'])
  if (!auth.ok) return auth.response

  // A05: ids de la consulta validados (400) antes de tocar la BD.
  const query = readQuery(req, ProjectQuery)
  if (!query.ok) return query.response
  const { searchParams } = new URL(req.url)
  const projectId = query.data.project_id
  const status    = searchParams.get('status')

  const { limit, offset } = parsePagination(req)
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })

  let q = admin
    .from('ops_dashboard')
    .select('*')
    .eq('project_id', projectId)
    .order('transferred_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) q = q.eq('post_handover_status', status)

  const { data, error } = await q
  if (error) return apiDbError(500, error)

  return NextResponse.json({ data: data ?? [], meta: { limit, offset } }, { headers: apiHeaders() })
}
