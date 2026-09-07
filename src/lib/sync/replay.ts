/**
 * CommUp — Replay queue helper (Stage 14.5)
 *
 * Llamado por el ServiceWorker (postMessage 'SYNC_REPLAY') o cuando
 * el navegador recupera conexión. Drena la cola IndexedDB aplicando
 * Last-Write-Wins automático y registra cada conflicto en el server.
 *
 * Sprint O (2026-09-07): después de las respuestas drena la bandeja de salida
 * (fotos → bucket + itr_attachments; punches → createPunch). Un fallo de red
 * detiene el replay (se reintenta luego); un rechazo del servidor cuenta un
 * intento y, al tercero, descarta la entrada dejando rastro en sync_conflicts.
 */

import {
  getAllQueued, removeFromQueue, getOutbox, removeFromOutbox, markOutboxAttempt,
  notifyOutboxChanged, SYNC_DONE_EVENT, type OutboxEntry,
} from '@/lib/offline-queue'
import { uploadPhoto, isNetworkFailure } from '@/lib/sync/outbox'
import { createPunch } from '@/app/actions/punches'
import type { Json } from '@/types/supabase.generated'
import { createClient } from '@/lib/supabase/client'
import { upsertResponse } from '@/app/actions/itr-instances'

const MAX_OUTBOX_ATTEMPTS = 3
let inFlight = false

export async function replayQueueOnce(): Promise<{ flushed: number; conflicts: number; remaining: number }> {
  if (inFlight) return { flushed: 0, conflicts: 0, remaining: -1 }
  inFlight = true
  let flushed = 0
  let conflicts = 0
  try {
    const supabase = createClient()
    const items = await getAllQueued()

    for (const item of items) {
      try {
        let winner: 'local' | 'remote' = 'local'
        let remotePayload: Json | null = null
        let remoteTs: string | null = null

        if (item.updatedAt) {
          // itr_responses no tiene updated_at — responded_at es el timestamp de escritura
          const { data: serverRow } = await supabase
            .from('itr_responses')
            .select('responded_at, value_text, value_numeric, value_bool, value_option, remarks, is_passed')
            .eq('itr_id', item.itrId)
            .eq('item_id', item.itemId)
            .maybeSingle()

          if (serverRow?.responded_at && serverRow.responded_at > item.updatedAt) {
            winner = 'remote'
            remotePayload = serverRow
            remoteTs = serverRow.responded_at
          }
        }

        if (winner === 'remote') {
          conflicts++
          await supabase.rpc('log_sync_conflict', {
            p_entity_type: 'itr_response',
            p_entity_id: `${item.itrId}:${item.itemId}`,
            p_local_payload: {
              valueText: item.valueText,
              valueNumeric: item.valueNumeric,
              valueBool: item.valueBool,
              valueOption: item.valueOption,
              remarks: item.remarks,
              isPassed: item.isPassed,
            },
            p_remote_payload: remotePayload ?? {},
            p_local_ts: item.updatedAt ?? item.queuedAt,
            p_remote_ts: remoteTs ?? item.queuedAt,
            p_winner: 'remote',
            p_notes: 'Auto LWW: server tenía versión más reciente',
          })
          // Descartamos el cambio local — el remoto gana
          if (item.id !== undefined) await removeFromQueue(item.id)
          continue
        }

        // winner === 'local' (no conflict o local más reciente)
        const res = await upsertResponse({
          itrId: item.itrId,
          itemId: item.itemId,
          templateId: item.templateId,
          valueText: item.valueText,
          valueNumeric: item.valueNumeric,
          valueBool: item.valueBool,
          valueOption: item.valueOption,
          remarks: item.remarks,
          isPassed: item.isPassed,
        })

        if (!res.error) {
          // Si había una versión remota distinta y la nuestra ganó, lo registramos
          if (remotePayload) {
            conflicts++
            await supabase.rpc('log_sync_conflict', {
              p_entity_type: 'itr_response',
              p_entity_id: `${item.itrId}:${item.itemId}`,
              p_local_payload: {
                valueText: item.valueText,
                valueNumeric: item.valueNumeric,
                valueBool: item.valueBool,
                valueOption: item.valueOption,
                remarks: item.remarks,
                isPassed: item.isPassed,
              },
              p_remote_payload: remotePayload ?? {},
              p_local_ts: item.updatedAt ?? item.queuedAt,
              p_remote_ts: remoteTs ?? item.queuedAt,
              p_winner: 'local',
              p_notes: 'Auto LWW: cliente tenía versión más reciente',
            })
          }
          if (item.id !== undefined) await removeFromQueue(item.id)
          flushed++
        } else {
          // Error de servidor — dejar en cola para próximo intento
          break
        }
      } catch {
        // Network todavía no — abortar y reintentar luego
        break
      }
    }

    const outbox = await replayOutboxOnce(supabase)
    flushed += outbox.flushed
    conflicts += outbox.dropped

    const remaining = (await getAllQueued()).length + outbox.remaining
    if (flushed > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_DONE_EVENT))
    return { flushed, conflicts, remaining }
  } finally {
    inFlight = false
  }
}

// ── Bandeja de salida: fotos y punches ────────────────────────────────

async function replayOutboxOnce(
  supabase: ReturnType<typeof createClient>,
): Promise<{ flushed: number; dropped: number; remaining: number }> {
  let flushed = 0
  let dropped = 0
  const entries = await getOutbox()

  for (const entry of entries) {
    if (entry.id === undefined) continue
    try {
      const result = await sendOutboxEntry(entry)
      if ('error' in result) {
        // Rechazo lógico del servidor (permiso, validación): contar intento.
        const attempts = (entry.attempts ?? 0) + 1
        if (attempts >= MAX_OUTBOX_ATTEMPTS) {
          await supabase.rpc('log_sync_conflict', {
            p_entity_type: entry.kind === 'photo' ? 'itr_attachment' : 'punch',
            p_entity_id: `${entry.itrId}:${entry.kind}:${entry.id}`,
            p_local_payload: outboxPayload(entry),
            p_remote_payload: {},
            p_local_ts: entry.queuedAt,
            p_remote_ts: new Date().toISOString(),
            p_winner: 'remote',
            p_notes: `Descartado tras ${attempts} intentos: ${result.error}`,
          })
          await removeFromOutbox(entry.id)
          dropped++
        } else {
          await markOutboxAttempt(entry.id, result.error)
        }
        continue
      }
      await removeFromOutbox(entry.id)
      flushed++
    } catch (err) {
      if (isNetworkFailure(err)) break   // sin red todavía: reintentar luego
      await markOutboxAttempt(entry.id, err instanceof Error ? err.message : String(err))
    }
  }

  if (flushed > 0 || dropped > 0) notifyOutboxChanged()
  const remaining = (await getOutbox()).length
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
  const res = await createPunch({
    projectId: entry.projectId, tagId: entry.tagId, itrId: entry.itrId,
    category: entry.category, description: entry.description, targetDate: entry.targetDate,
  })
  return res.error ? { error: res.error } : { ok: true }
}

function outboxPayload(entry: OutboxEntry): Json {
  if (entry.kind === 'photo') {
    return { kind: 'photo', itrId: entry.itrId, itemId: entry.itemId, fileName: entry.fileName, fileType: entry.fileType, bytes: entry.blob.size }
  }
  return { kind: 'punch', itrId: entry.itrId, tagId: entry.tagId, category: entry.category, description: entry.description, targetDate: entry.targetDate }
}
