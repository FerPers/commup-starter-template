/**
 * POST /api/v1/punches/:id/transfer-to-ops — move Cat B punch to Operations.
 * Body: { transferred_to: UUID, ops_target_date?: ISO date, notes?: string }
 *
 * Required scope: punches:write
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, ['punches:write'])
  if (!auth.ok) return auth.response

  const { id: punchId } = await params

  let body: { transferred_to?: string; ops_target_date?: string; notes?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  if (!body.transferred_to) {
    return NextResponse.json({ error: 'transferred_to is required' }, { status: 422, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: punch } = await admin
    .from('punches').select('id, project_id, projects!inner(org_id)')
    .eq('id', punchId).maybeSingle()
  const orgId = (punch?.projects as unknown as { org_id: string } | null)?.org_id
  if (!punch || orgId !== auth.orgId) {
    return NextResponse.json({ error: 'Punch not found' }, { status: 404, headers: apiHeaders() })
  }

  const { error } = await admin.rpc('transfer_punch_to_ops', {
    p_punch_id:        punchId,
    p_transferred_to:  body.transferred_to,
    p_ops_target_date: body.ops_target_date ?? null,
    p_notes:           body.notes ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: apiHeaders() })
  }

  await admin.from('domain_events').insert({
    org_id: auth.orgId, project_id: punch.project_id,
    aggregate_type: 'punch', aggregate_id: punchId,
    event_type: 'punch.transferred_to_ops',
    payload: { transferred_to: body.transferred_to, ops_target_date: body.ops_target_date ?? null, source: 'api_v1', key_id: auth.keyId },
    actor_id: null,
  })

  return NextResponse.json({ data: { id: punchId, post_handover_status: 'transferred_to_ops' } }, { headers: apiHeaders() })
}
