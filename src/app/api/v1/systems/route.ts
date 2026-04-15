/**
 * GET /api/v1/systems — List areas, systems, subsystems hierarchy
 *
 * Required scope: systems:read
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'

export const runtime = 'edge'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['systems:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })

  const [
    { data: areas },
    { data: systems },
    { data: subsystems },
  ] = await Promise.all([
    admin.from('areas').select('id, code, name').eq('project_id', projectId).order('code'),
    admin.from('systems').select('id, area_id, code, name').eq('project_id', projectId).order('code'),
    admin.from('subsystems').select('id, system_id, code, name').eq('project_id', projectId).order('code'),
  ])

  // Build nested hierarchy for ergonomic API consumption
  const hierarchy = (areas ?? []).map(area => ({
    id:       area.id,
    code:     area.code,
    name:     area.name,
    systems:  (systems ?? [])
      .filter(s => s.area_id === area.id)
      .map(sys => ({
        id:          sys.id,
        code:        sys.code,
        name:        sys.name,
        subsystems:  (subsystems ?? [])
          .filter(sub => sub.system_id === sys.id)
          .map(sub => ({ id: sub.id, code: sub.code, name: sub.name })),
      })),
  }))

  return NextResponse.json(
    { data: { areas: hierarchy } },
    { headers: apiHeaders() },
  )
}
