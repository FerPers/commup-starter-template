'use client'

// Hook de autosave de la ejecución de ITR (Q2, extraído de ItrExecution.tsx):
// estado optimista de responses (snake_case, espejo de la fila en DB) + cola
// offline + re-sync con props tras router.refresh().

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import type { ItrData, Response, SaveData } from './types'

export function useItrAutosave(itr: ItrData) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSavesRef = useRef(0)

  const { isOffline, pendingCount, syncing, saveWithQueue } = useOfflineSync(itr.id, itr.template_id)

  // Persist a full snapshot to IndexedDB so the ITR can be viewed offline
  useEffect(() => {
    if (typeof window !== 'undefined') {
      void import('@/lib/offline-queue').then(({ saveItrSnapshot }) => {
        saveItrSnapshot(itr.id, itr).catch(() => {})
      })
    }
  }, [itr])

  // Build response lookup by item_id. Re-sync when server data changes after
  // router.refresh() so server-side computed fields (e.g. defensive is_passed)
  // become visible without a hard reload.
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    return map
  })
  useEffect(() => {
    if (pendingSavesRef.current > 0) return
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    setResponses(map)
  }, [itr.itr_responses])

  const saveResponse = useCallback((itemId: string, data: SaveData) => {
    setSaveError(null)
    // Map camelCase patch → snake_case so state matches DB shape and reads
    // via response?.value_numeric / is_passed work consistently.
    const patch: Partial<Response> = {}
    if ('valueText'    in data) patch.value_text    = data.valueText ?? null
    if ('valueNumeric' in data) patch.value_numeric = data.valueNumeric ?? null
    if ('valueBool'    in data) patch.value_bool    = data.valueBool ?? null
    if ('valueOption'  in data) patch.value_option  = data.valueOption ?? null
    if ('remarks'      in data) patch.remarks       = data.remarks ?? null
    if ('isPassed'     in data) patch.is_passed     = data.isPassed ?? null
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }), ...patch },
    }))
    // Preserve every edit, including another field changed during an in-flight save.
    // Refresh only after the queue drains, so earlier server snapshots do not erase
    // optimistic edits that have not reached the server yet.
    pendingSavesRef.current += 1
    const task = saveQueueRef.current.then(async () => {
      let savedOnline = false
      try {
        const res = await saveWithQueue(itemId, data)
        if (res.error) { setSaveError(res.error); return }
        if (!res.queued) { savedOnline = true; setLastSaved(new Date()) }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la respuesta')
      } finally {
        pendingSavesRef.current -= 1
        if (pendingSavesRef.current === 0 && savedOnline) router.refresh()
      }
    })
    saveQueueRef.current = task
    startTransition(async () => { await task })
  }, [saveWithQueue, router])

  return { responses, saveResponse, lastSaved, saveError, isPending, isOffline, pendingCount, syncing }
}
