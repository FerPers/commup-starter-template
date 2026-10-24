/**
 * GET /api/v1/systems — List areas, systems, subsystems hierarchy
 *
 * Required scope: systems:read
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'
import { readQuery } from '@/lib/api/validate'
import { ProjectQuery } from '@/lib/api/schemas'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['systems:read'])
  if (!auth.ok) return auth.response

  // A05: ids de la consulta validados (400) antes de tocar la BD.
  const q = readQuery(req, ProjectQuery)
  if (!q.ok) return q.response
  const projectId = q.data.project_id

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
