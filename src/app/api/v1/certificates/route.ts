/**
 * GET /api/v1/certificates — List certificates in a project
 *
 * Required scope: certificates:read
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders } from '@/lib/api/auth'

export const runtime = 'edge'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['certificates:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId   = searchParams.get('project_id')
  const subsystemId = searchParams.get('subsystem_id')
  const status      = searchParams.get('status')  // pending|in_review|issued|rejected
  const { limit, offset } = parsePagination(req)

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })

  let query = admin
    .from('certificates')
    .select(`
      id, certificate_number, title, status, issued_date,
      subsystem_id, subsystems ( code, name ),
      project_phases ( code, name, certificate_name )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (subsystemId) query = query.eq('subsystem_id', subsystemId)
  if (status)      query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json(
    { data: data ?? [], meta: { limit, offset } },
    { headers: apiHeaders() },
  )
}
