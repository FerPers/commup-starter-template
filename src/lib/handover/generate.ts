/**
 * Shared handover generation logic — called by the public API route, the
 * `/admin/handover` server action and the ownership transfer to Operations.
 * Runs entirely server-side with the service role client (the caller is
 * responsible for org-level authorization).
 *
 * v3 (S24): RPC esquema 3.0 → ZIP con anexos, manifest.json firmado con Ed25519
 * (`buildHandoverBundle`). `signature_hash` = sha256 de handover.json (/verify/<hash>).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import type { Database } from '@/types/supabase.generated'
import type { Json } from '@/types/supabase.generated'
import { buildHandoverBundle } from './bundle'
import { loadSigningKey } from './sign'
import type { HandoverPackageData } from './types'
import { siteUrl } from '@/lib/site-url'

export type HandoverFormat = 'json' | 'pdf' | 'zip'

export type GenerateInput = {
  orgId:     string
  projectId: string
  systemIds: string[] | null
  formats:   HandoverFormat[]
  actorId:   string | null
  source:    'api_v1' | 'ui'
  keyId?:    string | null
  lang?:     'es' | 'en'
}

export type GenerateResult = {
  packageId:     string
  signatureHash: string
  jsonPath:      string | null
  pdfPath:       string | null
  zipPath:       string | null
  jsonUrl:       string | null
  pdfUrl:        string | null
  zipUrl:        string | null
  expiresIn:     number
}

/** Origen público para los enlaces de verificación (vive en src/lib/site-url.ts; se reexporta por compatibilidad). */
export { siteUrl }

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string') return o.message
    if (typeof o.error === 'string') return o.error
    try { return JSON.stringify(e) } catch { /* ignore */ }
  }
  return String(e)
}

export async function generateHandoverPackage(
  admin: SupabaseClient<Database>,
  input: GenerateInput,
): Promise<GenerateResult> {
  const { orgId, projectId, systemIds, formats, actorId, source, keyId } = input
  const lang = input.lang ?? 'es'

  const signingKey = await loadSigningKey()
  if (!signingKey) throw new Error('HANDOVER_ED25519_PRIVATE_KEY is required')

  // 1. Create DRAFT row
  const { data: pkgRow, error: insErr } = await admin
    .from('handover_packages')
    .insert({
      org_id:     orgId,
      project_id: projectId,
      status:     'GENERATING',
      version:    '3.0',
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
      p_system_ids: systemIds ?? undefined,
    })
    if (rpcErr) throw new Error(`RPC generate_handover_package failed: ${errMsg(rpcErr)}`)
    const handoverData = payload as unknown as HandoverPackageData

    const [t, { data: org }] = await Promise.all([
      getTranslations({ locale: lang, namespace: 'Startup' }),
      admin.from('organizations').select('name').eq('id', orgId).single(),
    ])
    const bundle = await buildHandoverBundle({
      db: admin, packageId, data: handoverData, orgName: org?.name ?? 'CommUp', lang,
      t: (k: string) => t(k as never), key: signingKey, verifyBaseUrl: siteUrl(),
    })
    const signatureHash = bundle.dataSha256

    const basePath = `${orgId}/${packageId}`
    const uploads: { path: string; body: Uint8Array; type: string }[] = []
    const jsonPath = formats.includes('json') ? `${basePath}.json` : null
    const pdfPath  = formats.includes('pdf')  ? `${basePath}.pdf`  : null
    const zipPath  = formats.includes('zip')  ? `${basePath}.zip`  : null
    if (jsonPath) uploads.push({ path: jsonPath, body: bundle.json, type: 'application/json' })
    if (pdfPath)  uploads.push({ path: pdfPath,  body: bundle.indexPdf, type: 'application/pdf' })
    if (zipPath)  uploads.push({ path: zipPath,  body: bundle.zip, type: 'application/zip' })
    for (const u of uploads) {
      const { error: upErr } = await admin.storage.from('handover-packages')
        .upload(u.path, new Blob([u.body as BlobPart], { type: u.type }), { contentType: u.type, upsert: true })
      if (upErr) throw new Error(`Upload failed (${u.path}): ${errMsg(upErr)}`)
    }

    // Sistemas del paquete (también los de un paquete de proyecto completo): /verify los muestra.
    if (handoverData.handover_package.systems.length > 0) {
      await admin.from('handover_package_systems').insert(
        handoverData.handover_package.systems.map((s) => ({ package_id: packageId, system_id: s.system_id })),
      )
    }

    const { error: updErr } = await admin
      .from('handover_packages')
      .update({
        status: 'ISSUED',
        json_path: jsonPath,
        pdf_path: pdfPath,
        zip_path: zipPath,
        signature_hash: signatureHash,
        signature: bundle.signature,
        signature_alg: 'ed25519',
        key_id: signingKey.keyId,
        manifest: bundle.manifest as unknown as Json,
      })
      .eq('id', packageId)
    if (updErr) throw new Error(`Package update failed: ${errMsg(updErr)}`)

    const [jsonSigned, pdfSigned, zipSigned] = await Promise.all([
      jsonPath ? admin.storage.from('handover-packages').createSignedUrl(jsonPath, 3600) : null,
      pdfPath  ? admin.storage.from('handover-packages').createSignedUrl(pdfPath,  3600) : null,
      zipPath  ? admin.storage.from('handover-packages').createSignedUrl(zipPath,  3600) : null,
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
        key_id_ed25519: signingKey.keyId,
        omitted: bundle.manifest.omitted.length,
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
      zipPath,
      jsonUrl: jsonSigned?.data?.signedUrl ?? null,
      pdfUrl:  pdfSigned?.data?.signedUrl  ?? null,
      zipUrl:  zipSigned?.data?.signedUrl  ?? null,
      expiresIn: 3600,
    }
  } catch (err) {
    const message = errMsg(err)
    await admin.from('handover_packages').update({ status: 'FAILED', error_message: message }).eq('id', packageId)
    throw err instanceof Error ? err : new Error(message)
  }
}
