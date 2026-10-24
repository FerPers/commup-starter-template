'use client'

import { getAllQueued, getOutbox, getStartupOutbox, entriesNotOwnedBy } from '@/lib/offline-queue'
import { buildCapturesExport, type CapturesExportMeta, type CapturesToExport } from './export-captures'
import { currentUserId } from './owner'

/**
 * A01 (resto): descarga en el navegador el ZIP de capturas (funciona sin red: todo sale de IndexedDB).
 * `scope` = qué se exporta: lo que se pasa, lo retenido (sin autor o de otra persona) o todo el dispositivo.
 */
export async function downloadCaptures(
  scope: CapturesToExport | 'held' | 'all',
  reason: CapturesExportMeta['reason'],
): Promise<number> {
  const userId = await currentUserId()
  const captures: CapturesToExport = scope === 'held'
    ? await entriesNotOwnedBy(userId)
    : scope === 'all'
      ? await Promise.all([getAllQueued(), getOutbox(), getStartupOutbox()]).then(([responses, outbox, startup]) => ({ responses, outbox, startup }))
      : scope
  const out = await buildCapturesExport(captures, { exportedAt: new Date().toISOString(), exportedBy: userId, reason })
  const url = URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = out.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return out.count
}
