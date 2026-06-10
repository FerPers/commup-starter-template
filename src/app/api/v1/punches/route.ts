/**
 * GET  /api/v1/punches — List punches in a project
 * POST /api/v1/punches — Create a punch
 *
 * Required scopes: punches:read / punches:write
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders } from '@/lib/api/auth'
import {
  requireProjectAccess,
  requireTagAccess,
  requireSubsystemAccess,
} from '@/lib/api/access'
import type { Enums } from '@/types/supabase.generated'

const PUNCH_STATUSES: Enums<'punch_status'>[] = ['open', 'in_progress', 'closed', 'cancelled']
const PUNCH_PRIORITIES: Enums<'punch_priority'>[] = ['critical', 'major', 'minor']

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

  // punches no tiene raised_at — created_at es la fecha de levantamiento
  let query = admin
    .from('punches')
    .select(`
      id, punch_number, category, description, status, priority,
      created_at, closed_date,
      tag_id, subsystem_id,
      tags ( tag_number ),
      subsystems ( code, name )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tagId) query = query.eq('tag_id', tagId)
  if (category) {
    const cat = category.toUpperCase()
    if (!['A', 'B', 'C'].includes(cat)) {
      return NextResponse.json({ error: 'category must be A, B, or C' }, { status: 422, headers: apiHeaders() })
    }
    query = query.eq('category', cat as Enums<'punch_category'>)
  }
  if (status) {
    if (!PUNCH_STATUSES.includes(status as Enums<'punch_status'>)) {
      return NextResponse.json(
        { error: `status must be one of: ${PUNCH_STATUSES.join(', ')}` },
        { status: 422, headers: apiHeaders() },
      )
    }
    query = query.eq('status', status as Enums<'punch_status'>)
  }

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

  const prio = (priority as string | undefined) ?? 'minor'
  if (!PUNCH_PRIORITIES.includes(prio as Enums<'punch_priority'>)) {
    return NextResponse.json(
      { error: `priority must be one of: ${PUNCH_PRIORITIES.join(', ')}` },
      { status: 422, headers: apiHeaders() },
    )
  }

  // subsystem_id y discipline_id son NOT NULL — se resuelven desde el tag,
  // igual que createPunch en src/app/actions/punches.ts
  const { data: tag } = await admin
    .from('tags')
    .select('subsystem_id, discipline_id')
    .eq('id', tag_id as string)
    .single()
  if (!tag?.subsystem_id || !tag.discipline_id) {
    return NextResponse.json(
      { error: 'Tag has no subsystem/discipline — cannot raise punch' },
      { status: 422, headers: apiHeaders() },
    )
  }

  // raised_by es NOT NULL — la API no tiene usuario; se atribuye al creador
  // de la API key, con fallback al owner de la org
  const { data: apiKey } = await admin
    .from('api_keys').select('created_by').eq('id', auth.keyId).maybeSingle()
  let raisedBy = apiKey?.created_by ?? null
  if (!raisedBy) {
    const { data: owner } = await admin
      .from('org_members').select('user_id').eq('org_id', auth.orgId)
      .eq('role', 'owner').limit(1).maybeSingle()
    raisedBy = owner?.user_id ?? null
  }
  if (!raisedBy) {
    return NextResponse.json(
      { error: 'Cannot resolve a user to attribute this punch to' },
      { status: 422, headers: apiHeaders() },
    )
  }

  const { data, error } = await admin
    .from('punches')
    .insert({
      project_id:   project_id as string,
      tag_id:       tag_id as string,
      subsystem_id: (subsystem_id as string | undefined) ?? tag.subsystem_id,
      discipline_id: tag.discipline_id,
      raised_by:    raisedBy,
      punch_number: '', // trigger punch_number_before_insert genera el correlativo
      category:     cat as Enums<'punch_category'>,
      description:  description as string,
      priority:     prio as Enums<'punch_priority'>,
      status:       'open',
      created_via:  'api_v1',
    })
    .select('id, punch_number, category, description, status, tag_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })

  await admin.from('domain_events').insert({
    org_id: auth.orgId, project_id: project_id as string,
    aggregate_type: 'punch', aggregate_id: data.id,
    event_type: 'punch.created',
    payload: { punch_number: data.punch_number, category: cat, tag_id: tag_id as string, source: 'api_v1', key_id: auth.keyId },
    actor_id: null,
  })

  return NextResponse.json({ data }, { status: 201, headers: apiHeaders() })
}
