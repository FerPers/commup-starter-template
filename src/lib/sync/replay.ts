/**
 * CommUp — Replay queue helper (Stage 14.5)
 *
 * Llamado por el ServiceWorker (postMessage 'SYNC_REPLAY') o cuando
 * el navegador recupera conexión. Drena la cola IndexedDB aplicando
 * Last-Write-Wins automático y registra cada conflicto en el server.
 */

import { getAllQueued, removeFromQueue } from '@/lib/offline-queue'
import { createClient } from '@/lib/supabase/client'
import { upsertResponse } from '@/app/actions/itr-instances'

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
        let remotePayload: Record<string, unknown> | null = null
        let remoteTs: string | null = null

        if (item.updatedAt) {
          const { data: serverRow } = await supabase
            .from('itr_responses')
            .select('updated_at, value_text, value_numeric, value_bool, value_option, remarks, is_passed')
            .eq('itr_id', item.itrId)
            .eq('item_id', item.itemId)
            .maybeSingle()

          if (serverRow?.updated_at && serverRow.updated_at > item.updatedAt) {
            winner = 'remote'
            remotePayload = serverRow as Record<string, unknown>
            remoteTs = serverRow.updated_at as string
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
            p_remote_payload: remotePayload,
            p_local_ts: item.updatedAt ?? item.queuedAt,
            p_remote_ts: remoteTs,
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
              p_remote_payload: remotePayload,
              p_local_ts: item.updatedAt ?? item.queuedAt,
              p_remote_ts: remoteTs,
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

    const remaining = (await getAllQueued()).length
    return { flushed, conflicts, remaining }
  } finally {
    inFlight = false
  }
}
