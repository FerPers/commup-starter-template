/**
 * GET  /api/v1/itrs — List ITRs in a project
 * POST /api/v1/itrs — Create an ITR instance
 *
 * Required scopes: itrs:read / itrs:write
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders } from '@/lib/api/auth'
import {
  requireProjectAccess,
  requireTagAccess,
  requireTemplateAccess,
  requirePhaseAccess,
} from '@/lib/api/access'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['itrs:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const tagId     = searchParams.get('tag_id')
  const status    = searchParams.get('status')
  const { limit, offset } = parsePagination(req)

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  // Verify org owns project
  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })
  }

  let query = admin
    .from('itrs')
    .select(`
      id, itr_number, status, progress_pct, scheduled_date, created_at,
      tag_id,
      tags ( tag_number, description ),
      itr_templates ( code, title ),
      project_phases ( code, name )
    `)
    .eq('project_id', projectId)
    .order('itr_number')
    .range(offset, offset + limit - 1)

  if (tagId)  query = query.eq('tag_id', tagId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json(
    { data: data ?? [], meta: { limit, offset } },
    { headers: apiHeaders() },
  )
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['itrs:write'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  const { project_id, tag_id, template_id, itr_number, scheduled_date, phase_id } = body

  if (!project_id || !tag_id || !template_id) {
    return NextResponse.json(
      { error: 'Required fields: project_id, tag_id, template_id' },
      { status: 422, headers: apiHeaders() },
    )
  }

  const admin = createAdminClient()

  // Cross-tenant FK guards: project (org), tag (project), template (org+is_global), phase (org).
  const projectCheck = await requireProjectAccess(admin, auth.orgId, project_id as string)
  if (!projectCheck.ok) return projectCheck.response

  const tagCheck = await requireTagAccess(admin, project_id as string, tag_id as string)
  if (!tagCheck.ok) return tagCheck.response

  const templateCheck = await requireTemplateAccess(admin, auth.orgId, template_id as string)
  if (!templateCheck.ok) return templateCheck.response

  if (phase_id) {
    const phaseCheck = await requirePhaseAccess(admin, auth.orgId, phase_id as string)
    if (!phaseCheck.ok) return phaseCheck.response
  }

  const { data, error } = await admin
    .from('itrs')
    .insert({
      project_id:      project_id     as string,
      tag_id:          tag_id         as string,
      template_id:     template_id    as string,
      itr_number:      itr_number     as string ?? '',
      scheduled_date:  scheduled_date as string ?? null,
      phase_id:        phase_id       as string ?? null,
      status:          'not_started',
      progress_pct:    0,
    })
    .select('id, itr_number, status, tag_id, template_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })

  await admin.from('domain_events').insert({
    org_id: auth.orgId, project_id: project_id as string,
    aggregate_type: 'itr', aggregate_id: data.id,
    event_type: 'itr.created',
    payload: { itr_number, tag_id, source: 'api_v1', key_id: auth.keyId },
    actor_id: null,
  })

  return NextResponse.json({ data }, { status: 201, headers: apiHeaders() })
}
