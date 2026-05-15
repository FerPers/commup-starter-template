/**
 * POST /api/v1/handover/export — Generate a handover package (JSON + PDF).
 * GET  /api/v1/handover/export — List packages for a project.
 *
 * Required scopes: handover:write / handover:read
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders, parsePagination } from '@/lib/api/auth'
import { requireProjectAccess, requireSystemsAccess } from '@/lib/api/access'
import { generateHandoverPackage } from '@/lib/handover/generate'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['handover:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const { limit, offset } = parsePagination(req)
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })
  }

  const { data, error } = await admin
    .from('handover_packages')
    .select('id, version, status, generated_by, generated_at, json_path, pdf_path, signature_hash, metadata, created_at')
    .eq('project_id', projectId)
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json({ data: data ?? [], meta: { limit, offset } }, { headers: apiHeaders() })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['handover:write'])
  if (!auth.ok) return auth.response

  let body: { project_id?: string; system_ids?: string[]; format?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  const projectId = body.project_id
  const systemIds = Array.isArray(body.system_ids) && body.system_ids.length > 0 ? body.system_ids : null
  const rawFormats = Array.isArray(body.format) && body.format.length > 0 ? body.format : ['json', 'pdf']
  const formats = rawFormats
    .map(f => f.toLowerCase())
    .filter((f): f is 'json' | 'pdf' => f === 'json' || f === 'pdf')

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }
  if (formats.length === 0) {
    return NextResponse.json({ error: 'format must include at least one of: json, pdf' }, { status: 422, headers: apiHeaders() })
  }

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
        status: 'ISSUED',
        signature_hash: result.signatureHash,
        files: {
          json: result.jsonPath ? { path: result.jsonPath, url: result.jsonUrl, expires_in: result.expiresIn } : null,
          pdf:  result.pdfPath  ? { path: result.pdfPath,  url: result.pdfUrl,  expires_in: result.expiresIn } : null,
        },
      },
    }, { status: 201, headers: apiHeaders() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500, headers: apiHeaders() })
  }
}
