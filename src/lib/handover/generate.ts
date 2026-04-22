/**
 * Shared handover generation logic — called by the public API route and the
 * `/admin/handover` server action. Runs entirely server-side with the service
 * role client (the caller is responsible for org-level authorization).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hmacSha256 } from '@/lib/api/auth'
import type { HandoverPackageData } from './types'

export type GenerateInput = {
  orgId:     string
  projectId: string
  systemIds: string[] | null
  formats:   ('json' | 'pdf')[]
  actorId:   string | null
  source:    'api_v1' | 'ui'
  keyId?:    string | null
}

export type GenerateResult = {
  packageId:     string
  signatureHash: string
  jsonPath:      string | null
  pdfPath:       string | null
  jsonUrl:       string | null
  pdfUrl:        string | null
  expiresIn:     number
}

export async function generateHandoverPackage(
  admin: SupabaseClient,
  input: GenerateInput,
): Promise<GenerateResult> {
  const { orgId, projectId, systemIds, formats, actorId, source, keyId } = input

  // 1. Create DRAFT row
  const { data: pkgRow, error: insErr } = await admin
    .from('handover_packages')
    .insert({
      org_id:     orgId,
      project_id: projectId,
      status:     'GENERATING',
      generated_by: actorId,
      metadata:   { system_ids: systemIds, format: formats, source, key_id: keyId ?? null },
    })
    .select('id')
    .single()
  if (insErr || !pkgRow) throw new Error(insErr?.message ?? 'Could not create package row')
  const packageId = pkgRow.id as string

  try {
    const { data: payload, error: rpcErr } = await admin.rpc('generate_handover_package', {
      p_project_id: projectId,
      p_system_ids: systemIds,
    })
    if (rpcErr) throw rpcErr
    const handoverData = payload as unknown as HandoverPackageData

    const signingSecret = process.env.HANDOVER_SIGNING_SECRET ?? process.env.CRON_SECRET ?? 'commup-dev-handover-secret'
    const jsonString    = JSON.stringify(handoverData)
    const signatureHash = await hmacSha256(signingSecret, jsonString)

    const basePath = `${orgId}/${packageId}`
    let jsonPath: string | null = null
    let pdfPath:  string | null = null

    if (formats.includes('json')) {
      jsonPath = `${basePath}.json`
      const { error: upErr } = await admin.storage
        .from('handover-packages')
        .upload(jsonPath, new Blob([jsonString], { type: 'application/json' }), {
          contentType: 'application/json',
          upsert: true,
        })
      if (upErr) throw upErr
    }

    if (formats.includes('pdf')) {
      const { renderHandoverPdf } = await import('./pdf')
      const pdfBytes = await renderHandoverPdf(handoverData, signatureHash)
      pdfPath = `${basePath}.pdf`
      const { error: upErr } = await admin.storage
        .from('handover-packages')
        .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr
    }

    if (systemIds && systemIds.length > 0) {
      await admin.from('handover_package_systems').insert(
        systemIds.map((sid) => ({ package_id: packageId, system_id: sid })),
      )
    }

    const { error: updErr } = await admin
      .from('handover_packages')
      .update({
        status: 'ISSUED',
        json_path: jsonPath,
        pdf_path: pdfPath,
        signature_hash: signatureHash,
      })
      .eq('id', packageId)
    if (updErr) throw updErr

    const [jsonSigned, pdfSigned] = await Promise.all([
      jsonPath ? admin.storage.from('handover-packages').createSignedUrl(jsonPath, 3600) : null,
      pdfPath  ? admin.storage.from('handover-packages').createSignedUrl(pdfPath,  3600) : null,
    ])

    await admin.from('domain_events').insert({
      org_id: orgId,
      project_id: projectId,
      aggregate_type: 'handover_package',
      aggregate_id:   packageId,
      event_type:     'handover.issued',
      payload: {
        system_ids: systemIds,
        formats,
        signature_hash: signatureHash,
        source,
        key_id: keyId ?? null,
      },
      actor_id: actorId,
    })

    return {
      packageId,
      signatureHash,
      jsonPath,
      pdfPath,
      jsonUrl: jsonSigned?.data?.signedUrl ?? null,
      pdfUrl:  pdfSigned?.data?.signedUrl  ?? null,
      expiresIn: 3600,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('handover_packages').update({ status: 'FAILED', error_message: message }).eq('id', packageId)
    throw err
  }
}
