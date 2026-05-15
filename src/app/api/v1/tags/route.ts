/**
 * GET  /api/v1/tags  — List tags in a project
 * POST /api/v1/tags  — Create a tag
 *
 * Required scopes: tags:read / tags:write
 * Query params:    project_id (required), subsystem_id?, discipline_code?, limit?, offset?
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders } from '@/lib/api/auth'
import {
  requireProjectAccess,
  requireSubsystemAccess,
  requireDisciplineAccess,
} from '@/lib/api/access'

// ── CORS preflight ────────────────────────────────────────────────────────────
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

// ── GET /api/v1/tags ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['tags:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId    = searchParams.get('project_id')
  const subsystemId  = searchParams.get('subsystem_id')
  const discCode     = searchParams.get('discipline_code')
  const status       = searchParams.get('status')
  const { limit, offset } = parsePagination(req)

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  // Verify project belongs to this org
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Project not found or not accessible' }, { status: 404, headers: apiHeaders() })
  }

  let query = admin
    .from('tag_360')
    .select(`
      tag_id, tag_number, description, tag_status,
      discipline_code, discipline_name, discipline_color,
      subsystem_id, subsystem_code, subsystem_name,
      system_code, system_name, area_code, area_name,
      manufacturer, model, serial_number,
      itr_total, itr_approved, itr_pct, itr_semaforo,
      open_punches_a, open_punches_b, open_punches_c,
      certs_issued, preservation_active_plans,
      pid_hotspot_count, semaforo_global
    `)
    .eq('project_id', projectId)
    .eq('org_id', auth.orgId)
    .order('tag_number')
    .range(offset, offset + limit - 1)

  if (subsystemId)  query = query.eq('subsystem_id', subsystemId)
  if (discCode)     query = query.eq('discipline_code', discCode)
  if (status)       query = query.eq('tag_status', status)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })
  }

  // Rename tag_id → id for cleaner API surface
  const items = (data ?? []).map(({ tag_id, tag_status, ...rest }) => ({
    id: tag_id,
    status: tag_status,
    ...rest,
  }))

  return NextResponse.json(
    { data: items, meta: { limit, offset, total: count ?? items.length } },
    { headers: apiHeaders() },
  )
}

// ── POST /api/v1/tags ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['tags:write'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  const { project_id, tag_number, subsystem_id, discipline_id, description, status } = body

  if (!project_id || !tag_number || !subsystem_id || !discipline_id) {
    return NextResponse.json(
      { error: 'Required fields: project_id, tag_number, subsystem_id, discipline_id' },
      { status: 422, headers: apiHeaders() },
    )
  }

  const admin = createAdminClient()

  // Verify project, subsystem and discipline all belong to this org/project.
  // Prevents cross-tenant inserts where an OrgA key references OrgB sub-resources.
  const projectCheck = await requireProjectAccess(admin, auth.orgId, project_id as string)
  if (!projectCheck.ok) return projectCheck.response

  const subsystemCheck = await requireSubsystemAccess(admin, project_id as string, subsystem_id as string)
  if (!subsystemCheck.ok) return subsystemCheck.response

  const disciplineCheck = await requireDisciplineAccess(admin, auth.orgId, discipline_id as string)
  if (!disciplineCheck.ok) return disciplineCheck.response

  const { data, error } = await admin
    .from('tags')
    .insert({
      project_id: project_id as string,
      tag_number:    tag_number    as string,
      subsystem_id:  subsystem_id  as string,
      discipline_id: discipline_id as string,
      description:   description   as string | null ?? null,
      status:        status        as string ?? 'not_started',
    })
    .select('id, tag_number, description, status, subsystem_id, discipline_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })
  }

  // Publish domain event
  await admin.from('domain_events').insert({
    org_id:         auth.orgId,
    project_id:     project_id as string,
    aggregate_type: 'tag',
    aggregate_id:   data.id,
    event_type:     'tag.created',
    payload:        { tag_number, source: 'api_v1', key_id: auth.keyId },
    actor_id:       null,
  })

  return NextResponse.json({ data }, { status: 201, headers: apiHeaders() })
}
