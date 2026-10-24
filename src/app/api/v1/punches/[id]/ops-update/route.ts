/**
 * PATCH /api/v1/punches/:id/ops-update — update post-handover status.
 * Body: { status: string, notes?: string, target_date?: ISO date }
 *
 * Required scope: punches:write
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, apiDbError } from '@/lib/api/auth'
import { readId, readJson } from '@/lib/api/validate'
import { PunchOpsUpdate } from '@/lib/api/schemas'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, ['punches:write'])
  if (!auth.ok) return auth.response

  // A05: id de la ruta y cuerpo validados (400 · 413 · 422) antes de tocar la BD.
  const idCheck = readId((await params).id)
  if (!idCheck.ok) return idCheck.response
  const punchId = idCheck.data
  const parsed = await readJson(req, PunchOpsUpdate)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const admin = createAdminClient({ apiKeyId: auth.keyId })

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
    return apiDbError(400, error)
  }

  return NextResponse.json({ data: { id: punchId, post_handover_status: body.status } }, { headers: apiHeaders() })
}
