/**
 * PATCH /api/v1/punches/:id/ops-update — update post-handover status.
 * Body: { status: string, notes?: string, target_date?: ISO date }
 *
 * Required scope: punches:write
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, ['punches:write'])
  if (!auth.ok) return auth.response

  const { id: punchId } = await params

  let body: { status?: string; notes?: string; target_date?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  if (!body.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 422, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: punch } = await admin
    .from('punches').select('id, project_id, projects!inner(org_id)')
    .eq('id', punchId).maybeSingle()
  const orgId = punch?.projects?.org_id
  if (!punch || orgId !== auth.orgId) {
    return NextResponse.json({ error: 'Punch not found' }, { status: 404, headers: apiHeaders() })
  }

  const { error } = await admin.rpc('update_punch_ops_status', {
    p_punch_id:    punchId,
    p_new_status:  body.status,
    p_notes:       body.notes ?? undefined,
    p_target_date: body.target_date ?? undefined,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })
  }

  const eventType = body.status === 'closed_final' ? 'punch.ops_closed' : 'punch.ops_updated'
  await admin.from('domain_events').insert({
    org_id: auth.orgId, project_id: punch.project_id,
    aggregate_type: 'punch', aggregate_id: punchId,
    event_type: eventType,
    payload: { status: body.status, notes: body.notes ?? null, source: 'api_v1', key_id: auth.keyId },
    actor_id: null,
  })

  return NextResponse.json({ data: { id: punchId, post_handover_status: body.status } }, { headers: apiHeaders() })
}
