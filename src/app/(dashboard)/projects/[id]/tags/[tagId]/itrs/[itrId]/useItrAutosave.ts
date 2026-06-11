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
  const savingRef = useRef(false)

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
    if (savingRef.current) return
    savingRef.current = true
    startTransition(async () => {
      const res = await saveWithQueue(itemId, data)
      savingRef.current = false
      if (res.queued) { return }           // offline — optimistic UI already set
      if (res.error) { setSaveError(res.error); return }
      setLastSaved(new Date())
      router.refresh()
    })
  }, [saveWithQueue, router])

  return { responses, saveResponse, lastSaved, saveError, isPending, isOffline, pendingCount, syncing }
}
