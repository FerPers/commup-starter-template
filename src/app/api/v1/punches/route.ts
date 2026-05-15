/**
 * GET  /api/v1/punches — List punches in a project
 * POST /api/v1/punches — Create a punch
 *
 * Required scopes: punches:read / punches:write
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders } from '@/lib/api/auth'
import {
  requireProjectAccess,
  requireTagAccess,
  requireSubsystemAccess,
} from '@/lib/api/access'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['punches:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId  = searchParams.get('project_id')
  const tagId      = searchParams.get('tag_id')
  const category   = searchParams.get('category')   // A | B | C
  const status     = searchParams.get('status')      // open | in_progress | closed
  const { limit, offset } = parsePagination(req)

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })

  let query = admin
    .from('punches')
    .select(`
      id, punch_number, category, description, status, priority,
      raised_at, closed_date,
      tag_id, subsystem_id,
      tags ( tag_number ),
      subsystems ( code, name )
    `)
    .eq('project_id', projectId)
    .order('raised_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tagId)    query = query.eq('tag_id', tagId)
  if (category) query = query.eq('category', category.toUpperCase())
  if (status)   query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json(
    { data: data ?? [], meta: { limit, offset } },
    { headers: apiHeaders() },
  )
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['punches:write'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  const { project_id, tag_id, subsystem_id, category, description, priority } = body

  if (!project_id || !tag_id || !category || !description) {
    return NextResponse.json(
      { error: 'Required fields: project_id, tag_id, category (A|B|C), description' },
      { status: 422, headers: apiHeaders() },
    )
  }

  const cat = (category as string).toUpperCase()
  if (!['A', 'B', 'C'].includes(cat)) {
    return NextResponse.json({ error: 'category must be A, B, or C' }, { status: 422, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  // Cross-tenant FK guards: project (org), tag (project), subsystem (project, optional).
  const projectCheck = await requireProjectAccess(admin, auth.orgId, project_id as string)
  if (!projectCheck.ok) return projectCheck.response

  const tagCheck = await requireTagAccess(admin, project_id as string, tag_id as string)
  if (!tagCheck.ok) return tagCheck.response

  if (subsystem_id) {
    const subsystemCheck = await requireSubsystemAccess(admin, project_id as string, subsystem_id as string)
    if (!subsystemCheck.ok) return subsystemCheck.response
  }

  // Auto-generate punch_number: PUNCH-<timestamp>
  const punch_number = `PUNCH-${Date.now()}`

  const { data, error } = await admin
    .from('punches')
    .insert({
      project_id:   project_id   as string,
      tag_id:       tag_id       as string,
      subsystem_id: subsystem_id as string ?? null,
      punch_number,
      category:     cat,
      description:  description  as string,
      priority:     priority     as string ?? 'minor',
      status:       'open',
      raised_at:    new Date().toISOString(),
    })
    .select('id, punch_number, category, description, status, tag_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })

  await admin.from('domain_events').insert({
    org_id: auth.orgId, project_id: project_id as string,
    aggregate_type: 'punch', aggregate_id: data.id,
    event_type: 'punch.created',
    payload: { punch_number, category: cat, tag_id, source: 'api_v1', key_id: auth.keyId },
    actor_id: null,
  })

  return NextResponse.json({ data }, { status: 201, headers: apiHeaders() })
}
