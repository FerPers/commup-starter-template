/**
 * POST /api/v1/handover/export — Generate a handover package (JSON + PDF).
 * GET  /api/v1/handover/export — List packages for a project.
 *
 * Required scopes: handover:write / handover:read
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, parsePagination, apiDbError } from '@/lib/api/auth'
import { readJson, readQuery } from '@/lib/api/validate'
import { HANDOVER_FORMATS, HandoverExport, ProjectQuery } from '@/lib/api/schemas'
import { requireProjectAccess, requireSystemsAccess } from '@/lib/api/access'
import { generateHandoverPackage, siteUrl, type HandoverFormat } from '@/lib/handover/generate'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['handover:read'])
  if (!auth.ok) return auth.response

  // A05: ids de la consulta validados (400) antes de tocar la BD.
  const q = readQuery(req, ProjectQuery)
  if (!q.ok) return q.response
  const projectId = q.data.project_id

  const { limit, offset } = parsePagination(req)
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })
  }

  const { data, error } = await admin
    .from('handover_packages')
    .select('id, version, status, omitted_count, generated_by, generated_at, json_path, pdf_path, signature_hash, metadata, created_at')
    .eq('project_id', projectId)
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return apiDbError(500, error)

  return NextResponse.json({ data: data ?? [], meta: { limit, offset } }, { headers: apiHeaders() })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['handover:write'])
  if (!auth.ok) return auth.response

  // A05: cuerpo validado (antes `format: [1]` llegaba a toLowerCase() y era un 500).
  const parsed = await readJson(req, HandoverExport)
  if (!parsed.ok) return parsed.response
  const projectId = parsed.data.project_id
  const systemIds = parsed.data.system_ids?.length ? parsed.data.system_ids : null
  const formats: HandoverFormat[] = [...new Set(parsed.data.format ?? HANDOVER_FORMATS)]

  const admin = createAdminClient()

  const projectCheck = await requireProjectAccess(admin, auth.orgId, projectId)
  if (!projectCheck.ok) return projectCheck.response

  // Each system_id passed by the caller must live inside the same project.
  if (systemIds) {
    const systemsCheck = await requireSystemsAccess(admin, projectId, systemIds)
    if (!systemsCheck.ok) return systemsCheck.response
  }

  try {
    const result = await generateHandoverPackage(admin, {
      orgId:     auth.orgId,
      projectId,
      systemIds,
      formats,
      actorId:   null,
      source:    'api_v1',
      keyId:     auth.keyId,
    })

    return NextResponse.json({
      data: {
        id: result.packageId,
        // A10: PARTIAL = firmado pero con anexos omitidos (manifest.omitted); ISSUED = completo.
        status: result.status,
        omitted_count: result.omittedCount,
        signature_hash: result.signatureHash,
        files: {
          json: result.jsonPath ? { path: result.jsonPath, url: result.jsonUrl, expires_in: result.expiresIn } : null,
          pdf:  result.pdfPath  ? { path: result.pdfPath,  url: result.pdfUrl,  expires_in: result.expiresIn } : null,
          zip:  result.zipPath  ? { path: result.zipPath,  url: result.zipUrl,  expires_in: result.expiresIn } : null,
        },
        verify_url: `${siteUrl()}/verify/${result.signatureHash}`,
      },
    }, { status: 201, headers: apiHeaders() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500, headers: apiHeaders() })
  }
}
