/**
 * GET /api/v1/handover/packages/:id — metadata + fresh signed URLs.
 *
 * Required scope: handover:read
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, apiDbError } from '@/lib/api/auth'
import { readId } from '@/lib/api/validate'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, ['handover:read'])
  if (!auth.ok) return auth.response

  // A05: un id que no es UUID es 400, no un error de Postgres.
  const idCheck = readId((await params).id)
  if (!idCheck.ok) return idCheck.response
  const id = idCheck.data
  const admin = createAdminClient()

  const { data: pkg, error } = await admin
    .from('handover_packages')
    .select('id, org_id, project_id, version, status, omitted_count, generated_by, generated_at, json_path, pdf_path, signature_hash, metadata, error_message, created_at')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (error) return apiDbError(500, error)
  if (!pkg)  return NextResponse.json({ error: 'Package not found' }, { status: 404, headers: apiHeaders() })

  const [jsonSigned, pdfSigned] = await Promise.all([
    pkg.json_path ? admin.storage.from('handover-packages').createSignedUrl(pkg.json_path, 3600) : null,
    pkg.pdf_path  ? admin.storage.from('handover-packages').createSignedUrl(pkg.pdf_path,  3600) : null,
  ])

  return NextResponse.json({
    data: {
      ...pkg,
      files: {
        json: pkg.json_path ? { path: pkg.json_path, url: jsonSigned?.data?.signedUrl ?? null, expires_in: 3600 } : null,
        pdf:  pkg.pdf_path  ? { path: pkg.pdf_path,  url: pdfSigned?.data?.signedUrl  ?? null, expires_in: 3600 } : null,
      },
    },
  }, { headers: apiHeaders() })
}
