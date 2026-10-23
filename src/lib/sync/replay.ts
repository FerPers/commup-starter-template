/**
 * CommUp — Replay queue helper (Stage 14.5)
 *
 * Llamado cuando el navegador recupera conexión (useOfflineSync), al «Forzar sincronización»
 * o al cerrar sesión con pendientes. Drena la cola IndexedDB.
 *
 * S18 sesión 2: las respuestas ya no usan LWW por reloj sino compare-and-set por versión (ver response-utils.ts).
 *
 * Sprint O (2026-09-07): después de las respuestas drena la bandeja de salida
 * (fotos → bucket + itr_attachments; punches → createPunch; firmas → signItr).
 * Un fallo de red detiene el replay (se reintenta luego); un rechazo del servidor
 * cuenta un intento y, al agotar la política (outboxPolicy: 3 para fotos/punches,
 * 1 para firmas), descarta la entrada dejando rastro en sync_conflicts y avisando
 * a la UI con SYNC_DROPPED_EVENT.
 *
 * Fase 6 (2026-10-16): al final drena la bandeja de arranque (src/lib/sync/startup-outbox.ts).
 *
 * S18: solo envía lo que capturó el usuario en sesión (src/lib/sync/ownership.ts); una respuesta rechazada
 * cuenta intentos y ya no traba la cola (C-07); una firma espera mientras su ITR tenga respuestas en cola.
 */

import {
  getAllQueued, removeFromQueue, markResponseAttempt, patchResponseEntry, getOutbox, removeFromOutbox, markOutboxAttempt,
  notifyOutboxChanged, SYNC_DONE_EVENT, SYNC_DROPPED_EVENT, type OutboxEntry, type SyncDroppedDetail,
} from '@/lib/offline-queue'
import { uploadPhoto, isNetworkFailure, sendPunch } from '@/lib/sync/outbox'
import { outboxPolicy, signatureWaits } from '@/lib/sync/outbox-utils'
import { currentUserId } from '@/lib/sync/owner'
import { sendableBy } from '@/lib/sync/ownership'
import { expectedVersion, responseHeld, responseKey } from '@/lib/sync/response-utils'
import { replayStartupOnce } from '@/lib/sync/startup-outbox'
import { signItr } from '@/app/actions/itr-instances'
import { createPunch } from '@/app/actions/punches'
import type { Json } from '@/types/supabase.generated'
import { createClient } from '@/lib/supabase/client'
import { upsertResponse } from '@/app/actions/itr-instances'

let inFlight = false

type ResponseItem = Awaited<ReturnType<typeof getAllQueued>>[number]

/** Solo los campos que la captura trajo (parche parcial: lo ausente no se toca). */
function pickResponseFields(item: ResponseItem) {
  const out: { valueText?: string | null; valueNumeric?: number | null; valueBool?: boolean | null; valueOption?: string | null; remarks?: string | null; isPassed?: boolean | null } = {}
  if ('valueText' in item) out.valueText = item.valueText
  if ('valueNumeric' in item) out.valueNumeric = item.valueNumeric
  if ('valueBool' in item) out.valueBool = item.valueBool
  if ('valueOption' in item) out.valueOption = item.valueOption
  if ('remarks' in item) out.remarks = item.remarks
  if ('isPassed' in item) out.isPassed = item.isPassed
  return out
}

function responseLocalPayload(item: ResponseItem): Json {
  return {
    valueText: item.valueText ?? null, valueNumeric: item.valueNumeric ?? null, valueBool: item.valueBool ?? null,
    valueOption: item.valueOption ?? null, remarks: item.remarks ?? null, isPassed: item.isPassed ?? null,
  }
}

export async function replayQueueOnce(): Promise<{ flushed: number; conflicts: number; remaining: number }> {
  if (inFlight) return { flushed: 0, conflicts: 0, remaining: -1 }
  inFlight = true
  let flushed = 0
  let conflicts = 0
  try {
    const supabase = createClient()
    // S18 (C-08/G-02): solo se envía lo que capturó el usuario en sesión; lo demás queda retenido.
    const userId = await currentUserId()
    const items = sendableBy(await getAllQueued(), userId)

    // S18 sesión 2 (C-35/B-16): sin comparar relojes. Cada respuesta lleva la versión de la casilla que vio el
    // dispositivo; si otra persona la cambió, queda en «conflicto» y decide el usuario (bandeja del ITR).
    const written = new Map<string, string>()
    for (const item of [...items].sort((x, y) => (x.id ?? 0) - (y.id ?? 0))) {
      if (item.id === undefined || responseHeld(item, items)) continue
      try {
        const res = await upsertResponse({
          itrId: item.itrId,
          itemId: item.itemId,
          templateId: item.templateId,
          ...pickResponseFields(item),
          capturedAt: item.updatedAt ?? item.queuedAt,
          expectedRespondedAt: expectedVersion(item, written),
        })

        if (res.conflict) {
          await patchResponseEntry(item.id, { state: 'conflict', remote: res.conflict, force: false })
          item.state = 'conflict' // retiene en este mismo replay las ediciones posteriores de la casilla
          conflicts++
          continue
        }
        if (!res.error) {
          if (res.respondedAt) written.set(responseKey(item), res.respondedAt)
          await removeFromQueue(item.id)
          flushed++
        } else {
          // S18 (C-07): rechazo lógico (ITR firmado/aprobado, ítem que ya no aplica). Cuenta un intento y sigue
          // con las demás; al agotar la política se descarta con rastro en sync_conflicts y aviso a la UI.
          if (outboxPolicy('response', item.attempts ?? 0) === 'drop') {
            await supabase.rpc('log_sync_conflict', {
              p_entity_type: 'itr_response',
              p_entity_id: `${item.itrId}:${item.itemId}`,
              p_local_payload: responseLocalPayload(item),
              p_remote_payload: {},
              p_local_ts: item.updatedAt ?? item.queuedAt,
              p_remote_ts: new Date().toISOString(),
              p_winner: 'remote',
              p_notes: `Descartado tras ${(item.attempts ?? 0) + 1} intento(s): ${res.error}`,
            })
            await removeFromQueue(item.id)
            conflicts++
            if (typeof window !== 'undefined') {
              const detail: SyncDroppedDetail = { kind: 'response', itrId: item.itrId, error: res.error }
              window.dispatchEvent(new CustomEvent(SYNC_DROPPED_EVENT, { detail }))
            }
          } else {
            await markResponseAttempt(item.id, res.error)
          }
        }
      } catch (err) {
        if (isNetworkFailure(err)) break // sin red todavía: reintentar luego
        await markResponseAttempt(item.id, err instanceof Error ? err.message : String(err))
      }
    }

    // Firmas de ITR que todavía tienen respuestas propias en cola (pendientes o en conflicto): esperan (C-07).
    const waiting = new Set(sendableBy(await getAllQueued(), userId).map(r => r.itrId))
    const outbox = await replayOutboxOnce(supabase, userId, waiting)
    flushed += outbox.flushed
    conflicts += outbox.dropped

    // Fase 6: pasos de ejecución, «Detener» y posiciones de line-up (bandeja propia, rechazos visibles).
    const startup = await replayStartupOnce(userId)
    flushed += startup.flushed
    conflicts += startup.issues

    const remaining = sendableBy(await getAllQueued(), userId).length + outbox.remaining + startup.remaining
    if (flushed > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_DONE_EVENT))
    return { flushed, conflicts, remaining }
  } finally {
    inFlight = false
  }
}

// ── Bandeja de salida: fotos y punches ────────────────────────────────

async function replayOutboxOnce(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  responsesPending: ReadonlySet<string>,
): Promise<{ flushed: number; dropped: number; remaining: number }> {
  let flushed = 0
  let dropped = 0
  const entries = sendableBy(await getOutbox(), userId)
  // G-17: ITR con fotos que en esta vuelta no se subieron (rechazadas o sin intentar): su firma espera.
  const photosPending = new Set<string>()

  for (const entry of entries) {
    if (entry.id === undefined) continue
    if (entry.kind === 'signature' && signatureWaits(entry.itrId, responsesPending, photosPending)) continue
    try {
      const result = await sendOutboxEntry(entry)
      if ('error' in result) {
        // Rechazo lógico del servidor (permiso, validación, ITR cambió de estado): contar intento.
        const attempts = (entry.attempts ?? 0) + 1
        if (outboxPolicy(entry.kind, entry.attempts ?? 0) === 'drop') {
          await supabase.rpc('log_sync_conflict', {
            p_project_id: entry.projectId,
            p_entity_type: entry.kind === 'photo' ? 'itr_attachment' : entry.kind === 'punch' ? 'punch' : 'itr_signature',
            p_entity_id: `${entry.itrId}:${entry.kind}:${entry.id}`,
            p_local_payload: outboxPayload(entry),
            p_remote_payload: {},
            p_local_ts: entry.queuedAt,
            p_remote_ts: new Date().toISOString(),
            p_winner: 'remote',
            p_notes: `Descartado tras ${attempts} intento(s): ${result.error}`,
          })
          await removeFromOutbox(entry.id)
          dropped++
          if (typeof window !== 'undefined') {
            const detail: SyncDroppedDetail = { kind: entry.kind, itrId: entry.itrId, error: result.error }
            window.dispatchEvent(new CustomEvent(SYNC_DROPPED_EVENT, { detail }))
          }
        } else {
          await markOutboxAttempt(entry.id, result.error)
          if (entry.kind === 'photo') photosPending.add(entry.itrId)
        }
        continue
      }
      await removeFromOutbox(entry.id)
      flushed++
    } catch (err) {
      if (isNetworkFailure(err)) break   // sin red todavía: reintentar luego
      await markOutboxAttempt(entry.id, err instanceof Error ? err.message : String(err))
      if (entry.kind === 'photo') photosPending.add(entry.itrId)
    }
  }

  if (flushed > 0 || dropped > 0) notifyOutboxChanged()
  const remaining = sendableBy(await getOutbox(), userId).length
  return { flushed, dropped, remaining }
}

async function sendOutboxEntry(entry: OutboxEntry): Promise<{ ok: true } | { error: string }> {
  if (entry.kind === 'photo') {
    const res = await uploadPhoto({
      itrId: entry.itrId, itemId: entry.itemId, projectId: entry.projectId, tagId: entry.tagId,
      fileName: entry.fileName, fileType: entry.fileType, blob: entry.blob,
    })
    return 'error' in res ? { error: res.error } : { ok: true }
  }
  if (entry.kind === 'signature') {
    const res = await signItr(entry.itrId, entry.role, entry.projectId, entry.tagId, entry.signatureImage)
    return res.error ? { error: res.error } : { ok: true }
  }
  // S06 (C-22): entradas nuevas llevan id y fotos → envío idempotente; las viejas se crean como antes.
  if (entry.punchId && entry.impact) {
    const res = await sendPunch({
      punchId: entry.punchId, itrId: entry.itrId, itrItemId: entry.itrItemId ?? null, projectId: entry.projectId, tagId: entry.tagId,
      category: entry.category, description: entry.description, targetDate: entry.targetDate,
      assignedTo: entry.assignedTo ?? null, impact: entry.impact, photos: entry.photos ?? [],
    })
    return 'error' in res ? { error: res.error } : { ok: true }
  }
  const res = await createPunch({
    projectId: entry.projectId, tagId: entry.tagId, itrId: entry.itrId,
    category: entry.category, description: entry.description, targetDate: entry.targetDate,
    impact: entry.impact, legacyWithoutImpact: !entry.impact,
  })
  return res.error ? { error: res.error } : { ok: true }
}

function outboxPayload(entry: OutboxEntry): Json {
  if (entry.kind === 'photo') {
    return { kind: 'photo', itrId: entry.itrId, itemId: entry.itemId, fileName: entry.fileName, fileType: entry.fileType, bytes: entry.blob.size }
  }
  if (entry.kind === 'signature') {
    return { kind: 'signature', itrId: entry.itrId, role: entry.role, hasImage: Boolean(entry.signatureImage) }
  }
  return { kind: 'punch', itrId: entry.itrId, tagId: entry.tagId, punchId: entry.punchId ?? null, category: entry.category, description: entry.description, targetDate: entry.targetDate, photos: entry.photos?.length ?? 0 }
}
