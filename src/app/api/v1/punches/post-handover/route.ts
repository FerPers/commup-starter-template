/**
 * GET /api/v1/punches/post-handover — list Cat B punches live post-handover.
 *
 * Required scope: punches:read
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, parsePagination } from '@/lib/api/auth'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['punches:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const status    = searchParams.get('status')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json({ data: data ?? [], meta: { limit, offset } }, { headers: apiHeaders() })
}
