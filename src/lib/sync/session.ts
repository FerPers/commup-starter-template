'use client'

/**
 * S18 (C-08/G-03/A-09) — fin de sesión en el dispositivo y capturas retenidas.
 *
 * - endDeviceSession: vacía las bandejas de IndexedDB y las cachés con datos de la sesión (páginas, imágenes,
 *   restos de API de versiones anteriores del SW). Se llama al cerrar sesión, después de «sincronizar o descartar».
 * - rememberDeviceUser: si entra otra persona sin que la anterior haya cerrado sesión (sesión vencida), se borran
 *   las cachés de páginas de la anterior; sus capturas quedan retenidas (solo ella puede enviarlas).
 * - discardNotMine: descarta las capturas retenidas (sin autor o de otra persona) dejando rastro en sync_conflicts.
 */

import { createClient } from '@/lib/supabase/client'
import {
  clearOfflineData, entriesNotOwnedBy, getAllQueued, getOutbox, getStartupOutbox, removeFromOutbox, removeFromQueue, removeStartupEntry,
  type OutboxEntry, type QueuedResponse,
} from '@/lib/offline-queue'
import type { StartupEntry } from './startup-outbox-utils'
import type { Json } from '@/types/supabase.generated'

/** = public/sw.js: cachés con datos del usuario (todo menos los recursos estáticos de la app). */
const SESSION_CACHE_PREFIXES = ['commup-pages-', 'commup-images-', 'commup-api-']
const LAST_USER_KEY = 'commup:device-user'

export async function purgeSessionCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  const keys = await caches.keys()
  await Promise.all(keys.filter(k => SESSION_CACHE_PREFIXES.some(p => k.startsWith(p))).map(k => caches.delete(k)))
  // Versiones del SW anteriores a S18 guardaban el HTML en la caché estática: quitar todo lo que no sea /_next/static.
  for (const k of keys.filter(k => k.startsWith('commup-static-'))) {
    const cache = await caches.open(k)
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname
      if (!path.startsWith('/_next/static/') && !path.startsWith('/icons/') && path !== '/manifest.json' && path !== '/offline' && path !== '/offline.html') {
        await cache.delete(req)
      }
    }
  }
}

export async function endDeviceSession(): Promise<void> {
  await Promise.allSettled([clearOfflineData(), purgeSessionCaches()])
  try { localStorage.removeItem(LAST_USER_KEY) } catch { /* modo privado */ }
}

/** Llamar al montar el shell con el usuario en sesión. */
export async function rememberDeviceUser(userId: string): Promise<void> {
  let previous: string | null = null
  try { previous = localStorage.getItem(LAST_USER_KEY) } catch { return }
  if (previous && previous !== userId) await purgeSessionCaches()
  try { localStorage.setItem(LAST_USER_KEY, userId) } catch { /* modo privado */ }
}

type Discardable =
  | { store: 'response'; row: QueuedResponse }
  | { store: 'outbox'; row: OutboxEntry }
  | { store: 'startup'; row: StartupEntry }

function trace(d: Discardable): { projectId: string | null; type: string; id: string; payload: Json; ts: string } {
  if (d.store === 'response') {
    const r = d.row
    return { projectId: null, type: 'itr_response', id: `${r.itrId}:${r.itemId}`, ts: r.updatedAt ?? r.queuedAt,
      payload: { valueText: r.valueText ?? null, valueNumeric: r.valueNumeric ?? null, valueBool: r.valueBool ?? null, valueOption: r.valueOption ?? null, remarks: r.remarks ?? null, capturedBy: r.capturedBy ?? null } }
  }
  if (d.store === 'outbox') {
    const e = d.row
    const type = e.kind === 'photo' ? 'itr_attachment' : e.kind === 'punch' ? 'punch' : 'itr_signature'
    const payload: Json = e.kind === 'punch'
      ? { kind: e.kind, itrId: e.itrId, category: e.category, description: e.description, capturedBy: e.capturedBy ?? null }
      : { kind: e.kind, itrId: e.itrId, capturedBy: e.capturedBy ?? null }
    return { projectId: e.projectId, type, id: `${e.itrId}:${e.kind}:${e.id}`, ts: e.queuedAt, payload }
  }
  const e = d.row
  const type = e.kind === 'run_step' ? 'procedure_run_step' : e.kind === 'run_stop' ? 'procedure_run' : 'lineup_item'
  const id = e.kind === 'run_step' ? `${e.runId}:${e.stepId}` : e.kind === 'run_stop' ? e.runId : e.itemId
  return { projectId: e.projectId, type, id, ts: e.capturedAt, payload: { kind: e.kind, capturedBy: e.capturedBy ?? null } }
}

/**
 * Descarta con rastro (exige red: el rastro va a sync_conflicts). `includeMine` descarta también lo propio
 * (cierre de sesión con red); por defecto, solo lo retenido (sin autor o de otra persona).
 */
export async function discardEntries(userId: string | null, opts: { includeMine?: boolean; note: string }): Promise<{ discarded: number; error?: string }> {
  const supabase = createClient()
  const held = opts.includeMine
    ? await Promise.all([getAllQueued(), getOutbox(), getStartupOutbox()]).then(([responses, outbox, startup]) => ({ responses, outbox, startup }))
    : await entriesNotOwnedBy(userId)
  const all: Discardable[] = [
    ...held.responses.map(row => ({ store: 'response' as const, row })),
    ...held.outbox.map(row => ({ store: 'outbox' as const, row })),
    ...held.startup.map(row => ({ store: 'startup' as const, row })),
  ]
  let discarded = 0
  for (const d of all) {
    if (d.row.id === undefined) continue
    const t = trace(d)
    const { error } = await supabase.rpc('log_sync_conflict', {
      ...(t.projectId ? { p_project_id: t.projectId } : {}),
      p_entity_type: t.type,
      p_entity_id: t.id,
      p_local_payload: t.payload,
      p_remote_payload: {},
      p_local_ts: t.ts,
      p_remote_ts: new Date().toISOString(),
      p_winner: 'remote',
      p_notes: opts.note,
    })
    if (error) return { discarded, error: error.message }
    if (d.store === 'response') await removeFromQueue(d.row.id)
    else if (d.store === 'outbox') await removeFromOutbox(d.row.id)
    else await removeStartupEntry(d.row.id)
    discarded++
  }
  return { discarded }
}
