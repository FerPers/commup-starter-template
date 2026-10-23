/**
 * ZIP del paquete de handover (S24, D17): handover.json + índice PDF + anexos (PDF de procedimientos y de su
 * última ejecución, line-ups verificados, eventos de arranque, reportes de desempeño/PTC, PSSR, certificados, ITR,
 * los archivos de los documentos vigentes y, P4, el PDF LOSH del sistema), manifest.json con el sha256 de
 * cada archivo y manifest.sig (Ed25519 sobre los bytes de manifest.json).
 *
 * Corre en línea en el Worker, un sistema por paquete: los anexos se generan en lotes chicos y con topes (cantidad
 * de ITR y bytes de documentos) para no pasar CPU ni memoria; lo que no entra queda en `omitted` con el motivo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { zipSync, strToU8, type Zippable } from 'fflate'
import type { Database } from '@/types/supabase.generated'
import { loadCertificatePdf, loadEventPdf, loadItrPdf, loadLineupPdf, loadLoshPdf, loadPerformancePdf, loadProcedurePdf, loadPssrPdf, loadRunPdf } from '@/lib/pdf/load'
import { renderEventPdf, renderLineupPdf, renderRunPdf } from '@/lib/pdf/startup-records'
import { renderProcedurePdf } from '@/lib/pdf/procedure'
import { renderPerformancePdf } from '@/lib/pdf/performance-report'
import { renderPssrPdf } from '@/lib/pdf/pssr'
import { renderCertificatePdf } from '@/lib/pdf/certificate'
import { renderItrPdf } from '@/lib/pdf/itr'
import { renderLoshPdf } from '@/lib/pdf/losh'
import { renderHandoverPdf } from './pdf'
import { loadPdfBranding } from '@/lib/pdf/branding'
import { sha256Hex, signBytes, type SigningKey } from './sign'
import type { HandoverManifest, HandoverPackageData } from './types'

type Db = SupabaseClient<Database>

/** Topes por paquete: ITR con PDF propio y bytes de archivos de documentos copiados al ZIP. */
export const MAX_ITR_PDFS = 150
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024
const BATCH = 4

export type Annex = { path: string; bytes: Uint8Array }
/** Una tarea devuelve el archivo, el motivo por el que no entra (string) o null = no aplica (no se lista). */
type Task = { path: string; run: () => Promise<Uint8Array | string | null> }

/** Nombre seguro para una ruta dentro del ZIP. */
export function safeName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'archivo'
}

async function runTasks(tasks: Task[]): Promise<{ files: Annex[]; omitted: { path: string; reason: string }[] }> {
  const files: Annex[] = []
  const omitted: { path: string; reason: string }[] = []
  for (let i = 0; i < tasks.length; i += BATCH) {
    const results = await Promise.allSettled(tasks.slice(i, i + BATCH).map(t => t.run()))
    results.forEach((r, j) => {
      const path = tasks[i + j].path
      if (r.status === 'rejected') omitted.push({ path, reason: String((r.reason as Error)?.message ?? r.reason) })
      else if (typeof r.value === 'string') omitted.push({ path, reason: r.value })
      else if (r.value) files.push({ path, bytes: r.value })
    })
  }
  return { files, omitted }
}

export type BundleInput = {
  db: Db
  packageId: string
  data: HandoverPackageData
  orgName: string
  lang: 'es' | 'en'
  /** Traductor del espacio `Startup` (etiquetas de procedimientos y desempeño). */
  t: (key: string) => string
  key: SigningKey
  /** URL base pública para la línea «verificar en …» del índice y del LEEME. */
  verifyBaseUrl: string
}

export type BundleResult = {
  json: Uint8Array
  indexPdf: Uint8Array
  zip: Uint8Array
  dataSha256: string
  manifest: HandoverManifest
  signature: string
}

export async function buildHandoverBundle(x: BundleInput): Promise<BundleResult> {
  const { db, data, lang, t } = x
  const pkg = data.handover_package
  const projectId = pkg.project.id
  const json = strToU8(JSON.stringify(data))
  const dataSha256 = await sha256Hex(json)

  // E2: logos una sola vez para todo el paquete (índice, certificados, ITR).
  const branding = await loadPdfBranding(db, projectId)
  const tasks: Task[] = []
  let itrBudget = MAX_ITR_PDFS
  let docBytes = 0
  const omittedUpfront: { path: string; reason: string }[] = []
  const fail = (what: string) => `${what}: no encontrado`

  // Los eventos del JSON no traen su id: se resuelven por número (único por proyecto).
  const eventNumbers = pkg.systems.flatMap(s => (s.startup_events ?? []).map(e => e.number))
  const { data: eventRows } = eventNumbers.length
    // bounded: los eventos del paquete (in() con sus números)
    ? await db.from('startup_events').select('id, number').eq('project_id', projectId).in('number', eventNumbers)
    : { data: [] }
  const eventId = new Map((eventRows ?? []).map(e => [e.number, e.id]))
  const startup = { projectId, orgName: x.orgName, lang, t }

  for (const sys of pkg.systems) {
    const dir = `anexos/${safeName(sys.code)}`
    for (const p of sys.procedures ?? []) {
      if (!p.revision) continue
      tasks.push({ path: `${dir}/procedimientos/${safeName(`${p.number}-R${p.revision.rev}`)}.pdf`, run: async () => {
        const r = await loadProcedurePdf(db, { projectId, procedureId: p.procedure_id, revId: p.revision!.revision_id, orgName: x.orgName, lang, t })
        return r ? renderProcedurePdf(r.input) : fail(p.number)
      } })
      // S24b (E-22): registro ejecutado de la última ejecución completada.
      const run = p.last_run
      if (run) tasks.push({ path: `${dir}/procedimientos/${safeName(run.number)}.pdf`, run: async () => {
        const r = await loadRunPdf(db, { ...startup, runId: run.run_id })
        return r ? renderRunPdf(r.input) : fail(run.number)
      } })
    }
    for (const ls of sys.lineups ?? []) {
      tasks.push({ path: `${dir}/lineups/${safeName(ls.number)}.pdf`, run: async () => {
        const r = await loadLineupPdf(db, { ...startup, sheetId: ls.sheet_id })
        return r ? renderLineupPdf(r.input) : fail(ls.number)
      } })
    }
    for (const ev of sys.startup_events ?? []) {
      const id = eventId.get(ev.number)
      const path = `${dir}/eventos/${safeName(ev.number)}.pdf`
      if (!id) { omittedUpfront.push({ path, reason: fail(ev.number) }); continue }
      tasks.push({ path, run: async () => {
        const r = await loadEventPdf(db, { ...startup, eventId: id })
        return r ? renderEventPdf(r.input) : fail(ev.number)
      } })
    }
    for (const test of sys.performance ?? []) {
      for (const run of test.runs) {
        tasks.push({ path: `${dir}/desempeno/${safeName(run.number)}.pdf`, run: async () => {
          const r = await loadPerformancePdf(db, { projectId, runId: run.run_id, orgName: x.orgName, lang, t })
          if (!r) return fail(run.number)
          return 'error' in r ? r.error : renderPerformancePdf(r.input)
        } })
      }
    }
    for (const rv of sys.pssr ?? []) {
      tasks.push({ path: `${dir}/pssr/${safeName(rv.review_number)}.pdf`, run: async () => {
        const r = await loadPssrPdf(db, { projectId, reviewId: rv.review_id })
        return r ? renderPssrPdf(r.input) : fail(rv.review_number)
      } })
    }
    for (const c of pkg.certificates.filter(c => c.system_id === sys.system_id)) {
      tasks.push({ path: `${dir}/certificados/${safeName(c.certificate_number)}.pdf`, run: async () => {
        const r = await loadCertificatePdf(db, { projectId, certId: c.certificate_id, branding })
        return r ? renderCertificatePdf(r.input) : fail(c.certificate_number)
      } })
    }
    for (const itr of sys.itrs.filter(i => i.status === 'approved' || i.status === 'completed')) {
      const path = `${dir}/itr/${safeName(itr.itr_number)}.pdf`
      if (itrBudget-- <= 0) { omittedUpfront.push({ path, reason: `más de ${MAX_ITR_PDFS} ITR por paquete` }); continue }
      tasks.push({ path, run: async () => {
        const r = await loadItrPdf(db, { projectId, itrId: itr.itr_id, branding })
        return r ? renderItrPdf(r.input) : fail(itr.itr_number)
      } })
    }
    // P4: límites del sistema sobre sus hojas P&ID vigentes; sin marcas no hay PDF (no es una omisión).
    tasks.push({ path: `${dir}/limites/Limites-${safeName(sys.code)}.pdf`, run: async () => {
      const r = await loadLoshPdf(db, { projectId, systemId: sys.system_id, branding })
      if (!r) return fail(sys.code)
      return r.input.losh.sheets.length ? renderLoshPdf(r.input) : null
    } })
    for (const d of sys.documents ?? []) {
      const rev = d.revision
      if (!rev?.file_path) continue
      const path = `${dir}/documentos/${safeName(`${d.number}-${rev.rev}`)}-${safeName(rev.file_name ?? 'archivo.pdf')}`
      tasks.push({ path, run: async () => {
        const { data: blob, error } = await db.storage.from('project-documents').download(rev.file_path!)
        if (error || !blob) return `descarga fallida: ${error?.message ?? 'sin archivo'}`
        if (docBytes + blob.size > MAX_DOCUMENT_BYTES) return `supera el tope de ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB de documentos`
        docBytes += blob.size
        return new Uint8Array(await blob.arrayBuffer())
      } })
    }
  }

  const annexes = await runTasks(tasks)
  const omitted = [...omittedUpfront, ...annexes.omitted]
  annexes.files.sort((a, b) => a.path.localeCompare(b.path))

  const verifyUrl = `${x.verifyBaseUrl.replace(/\/$/, '')}/verify/${dataSha256}`
  const indexPdf = await renderHandoverPdf(data, {
    lang, dataSha256, keyId: x.key.keyId, verifyUrl, label: t,
    annexes: annexes.files.map(f => f.path), omitted, branding,
  })

  const indexName = `${safeName(pkg.project.code)}-handover.pdf`
  const files = [
    { path: 'handover.json', bytes: json },
    { path: indexName, bytes: indexPdf },
    ...annexes.files,
  ]
  const manifest: HandoverManifest = {
    format: 'commup-handover',
    schema_version: pkg.schema_version,
    package_id: x.packageId,
    generated_at: pkg.generated_at,
    project_code: pkg.project.code,
    systems: pkg.systems.map(s => s.code),
    data_sha256: dataSha256,
    files: await Promise.all(files.map(async f => ({ path: f.path, sha256: await sha256Hex(f.bytes), bytes: f.bytes.byteLength }))),
    omitted,
    signature: { alg: 'Ed25519', key_id: x.key.keyId },
  }
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2))
  const signature = await signBytes(x.key, manifestBytes)

  const readme = [
    `CommUp — paquete de handover ${pkg.project.code} (${manifest.systems.join(', ')})`,
    `Generado: ${pkg.generated_at}`,
    '',
    'Verificación:',
    `1. Consulte ${verifyUrl}`,
    '2. sha256 de cada archivo = el de manifest.json (sha256sum / Get-FileHash).',
    `3. manifest.sig es la firma Ed25519 (base64) de manifest.json; clave pública ${x.key.keyId} en`,
    `   ${x.verifyBaseUrl.replace(/\/$/, '')}/api/v1/handover/public-key?format=pem  (guárdela como commup-handover.pem) y con OpenSSL:`,
    '   base64 -d manifest.sig > manifest.sig.bin',
    '   openssl pkeyutl -verify -pubin -inkey commup-handover.pem -rawin -in manifest.json -sigfile manifest.sig.bin',
    ...(omitted.length ? ['', 'Anexos no incluidos:', ...omitted.map(o => `- ${o.path}: ${o.reason}`)] : []),
    '',
  ].join('\n')

  const zippable: Zippable = {
    'LEEME.txt': [strToU8(readme), { level: 6 }],
    'manifest.json': [manifestBytes, { level: 6 }],
    'manifest.sig': [strToU8(signature), { level: 0 }],
  }
  // JSON comprime bien; PDF y archivos binarios ya vienen comprimidos (nivel 0 = menos CPU).
  for (const f of files) zippable[f.path] = [f.bytes, { level: f.path.endsWith('.json') ? 6 : 0 }]
  const zip = zipSync(zippable, { mtime: new Date(pkg.generated_at) })

  return { json, indexPdf, zip, dataSha256, manifest, signature }
}
