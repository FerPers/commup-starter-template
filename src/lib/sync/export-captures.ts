import { strToU8, zipSync, type Zippable } from 'fflate'
import type { OutboxEntry, QueuedResponse } from '@/lib/offline-queue'
import type { StartupEntry } from './startup-outbox-utils'

/**
 * A01 (revisión 2026-10-23 hallazgo 1, resto): las capturas que no se pueden enviar (rechazadas por el servidor, sin
 * autor o de otra persona) se pueden EXPORTAR antes de descartarlas, con sus binarios: un ZIP con `capturas.json`
 * (todos los datos y horas de campo), las fotos y las firmas como archivos y un LEEME. Puro (sin IndexedDB ni DOM)
 * para probarlo; quien llama junta las entradas y descarga los bytes.
 */

export type CapturesToExport = {
  responses?: readonly QueuedResponse[]
  outbox?: readonly OutboxEntry[]
  startup?: readonly StartupEntry[]
}

export type CapturesExportMeta = {
  exportedAt: string
  /** Usuario en sesión al exportar (puede no ser quien capturó). */
  exportedBy: string | null
  /** Para qué se exportó: la bandeja «No sincronizado» de un ITR, capturas retenidas o el cierre de sesión. */
  reason: 'unsynced' | 'held' | 'sign_out'
}

export type CapturesExport = { bytes: Uint8Array; fileName: string; count: number }

const FORMAT = 'commup-captures'
const SCHEMA_VERSION = 1

/** Nombre seguro dentro del ZIP (sin rutas ni caracteres raros), conservando la extensión. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo'
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'archivo'
}

/** `data:image/png;base64,…` → bytes y extensión; null si no es una imagen en base64. */
export function dataUrlBytes(dataUrl: string | null | undefined): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl ?? '')
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, ext: m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase() }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function buildCapturesExport(captures: CapturesToExport, meta: CapturesExportMeta): Promise<CapturesExport> {
  const files: Zippable = {}
  const records: Record<string, unknown>[] = []

  for (const r of captures.responses ?? []) {
    records.push({
      kind: 'response', localId: r.id ?? null, itrId: r.itrId, itemId: r.itemId, templateId: r.templateId,
      value: { text: r.valueText ?? null, numeric: r.valueNumeric ?? null, bool: r.valueBool ?? null, option: r.valueOption ?? null },
      remarks: r.remarks ?? null, isPassed: r.isPassed ?? null,
      capturedBy: r.capturedBy ?? null, queuedAt: r.queuedAt, capturedAt: r.updatedAt ?? r.queuedAt,
      attempts: r.attempts ?? 0, lastError: r.lastError ?? null, state: r.state ?? null,
    })
  }

  for (const e of captures.outbox ?? []) {
    const common = {
      localId: e.id ?? null, itrId: e.itrId, projectId: e.projectId, tagId: e.tagId,
      capturedBy: e.capturedBy ?? null, queuedAt: e.queuedAt, attempts: e.attempts, lastError: e.lastError ?? null,
    }
    if (e.kind === 'photo') {
      const path = `fotos/${e.captureId ?? `local-${e.id ?? records.length}`}-${safeFileName(e.fileName)}`
      files[path] = [await blobBytes(e.blob), { level: 0 }]
      records.push({ kind: 'photo', ...common, itemId: e.itemId, captureId: e.captureId ?? null, capturedAt: e.capturedAt ?? e.queuedAt, fileName: e.fileName, fileType: e.fileType, bytes: e.blob.size, file: path })
    } else if (e.kind === 'punch') {
      const folder = `punches/${e.punchId ?? `local-${e.id ?? records.length}`}`
      const photos = []
      for (const [i, p] of (e.photos ?? []).entries()) {
        const path = `${folder}/foto-${i + 1}-${safeFileName(p.fileName)}`
        files[path] = [await blobBytes(p.blob), { level: 0 }]
        photos.push({ fileName: p.fileName, fileType: p.fileType, bytes: p.blob.size, file: path })
      }
      records.push({
        kind: 'punch', ...common, punchId: e.punchId ?? null, itrItemId: e.itrItemId ?? null, category: e.category,
        description: e.description, impact: e.impact ?? null, targetDate: e.targetDate, assignedTo: e.assignedTo ?? null, photos,
      })
    } else {
      const image = dataUrlBytes(e.signatureImage)
      const path = image ? `firmas/${e.id ?? records.length}-${e.role}.${image.ext}` : null
      if (image && path) files[path] = [image.bytes, { level: 0 }]
      records.push({ kind: 'signature', ...common, role: e.role, file: path })
    }
  }

  for (const s of captures.startup ?? []) {
    records.push({ kind: `startup_${s.kind}`, localId: s.id ?? null, capturedBy: s.capturedBy ?? null, capturedAt: s.capturedAt, state: s.state, error: s.error ?? null, op: { ...s, id: undefined, remote: undefined } })
  }

  const stamp = meta.exportedAt.replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  const manifest = { format: FORMAT, schema_version: SCHEMA_VERSION, exported_at: meta.exportedAt, exported_by: meta.exportedBy, reason: meta.reason, count: records.length, captures: records }
  files['capturas.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }]
  files['LEEME.txt'] = [strToU8([
    'CommUp — capturas de campo exportadas desde este dispositivo',
    `Exportado: ${meta.exportedAt}${meta.exportedBy ? ` por ${meta.exportedBy}` : ''}`,
    `Capturas: ${records.length}`,
    '',
    'Son capturas hechas sin red que no llegaron al servidor (rechazadas, sin autor o de otra persona).',
    'capturas.json tiene cada una con su ITR, ítem, valores, quién la capturó, la hora de campo (capturedAt)',
    'y el último error. Las fotos y firmas están en fotos/, punches/ y firmas/ (columna "file").',
    'Entregue este archivo a su supervisor o administrador para revisarlas y registrarlas a mano.',
    '',
  ].join('\n')), { level: 6 }]

  return { bytes: zipSync(files, { mtime: new Date(meta.exportedAt) }), fileName: `commup-capturas-${stamp}.zip`, count: records.length }
}
