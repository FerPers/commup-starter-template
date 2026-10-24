/**
 * GET /api/v1/certificates — List certificates in a project
 *
 * Required scope: certificates:read
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, parsePagination, apiHeaders, apiDbError } from '@/lib/api/auth'
import { readQuery } from '@/lib/api/validate'
import { CertificatesQuery } from '@/lib/api/schemas'
import type { Enums } from '@/types/supabase.generated'

const CERT_STATUSES: Enums<'certificate_status'>[] = ['pending', 'in_review', 'issued', 'rejected']

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['certificates:read'])
  if (!auth.ok) return auth.response

  // A05: ids de la consulta validados (400) antes de tocar la BD.
  const q = readQuery(req, CertificatesQuery)
  if (!q.ok) return q.response
  const { searchParams } = new URL(req.url)
  const projectId   = q.data.project_id
  const subsystemId = q.data.subsystem_id
  const status      = searchParams.get('status')  // pending|in_review|issued|rejected
  const { limit, offset } = parsePagination(req)

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
  if (status) {
    if (!CERT_STATUSES.includes(status as Enums<'certificate_status'>)) {
      return NextResponse.json(
        { error: `status must be one of: ${CERT_STATUSES.join(', ')}` },
        { status: 422, headers: apiHeaders() },
      )
    }
    query = query.eq('status', status as Enums<'certificate_status'>)
  }

  const { data, error } = await query
  if (error) return apiDbError(500, error)

  return NextResponse.json(
    { data: data ?? [], meta: { limit, offset } },
    { headers: apiHeaders() },
  )
}
