'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { enqueueResponse, countPending, OUTBOX_CHANGED_EVENT } from '@/lib/offline-queue'
import { upsertResponse } from '@/app/actions/itr-instances'
import { replayQueueOnce } from '@/lib/sync/replay'

type ResponseData = {
  valueText?: string | null
  valueNumeric?: number | null
  valueBool?: boolean | null
  valueOption?: string | null
  remarks?: string | null
  isPassed?: boolean | null
}

// Called with itrId + templateId for ITR execution context.
// Called with no args from sidebar to get global online/pending status.
// Estado de red sin romper la hidratación: el SSR (y el primer render del cliente) asumen «en línea»;
// tras hidratar, React vuelve a renderizar con navigator.onLine y se suscribe a online/offline.
function subscribeNetwork(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOfflineSync(itrId = '', templateId = '') {
  const browserOffline = useSyncExternalStore(subscribeNetwork, () => !navigator.onLine, () => false)
  // El navegador puede decir «en línea» y aun así fallar el guardado (red cautiva): eso también es sin red.
  const [saveFailed, setSaveFailed] = useState(false)
  const isOffline = browserOffline || saveFailed
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // Pendientes (respuestas + bandeja de salida) al montar y cada vez que cambia la bandeja.
  useEffect(() => {
    const refresh = () => { countPending(itrId || undefined).then(setPendingCount).catch(() => {}) }
    refresh()
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh)
  }, [itrId])

  // Drain the queue using last-write-wins; conflicts are logged server-side
  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await replayQueueOnce()
      setPendingCount(await countPending(itrId || undefined))
    } catch {
      // IndexedDB unavailable — ignore
    }
    syncingRef.current = false
    setSyncing(false)
  }, [itrId])

  // Listen to browser online/offline events
  useEffect(() => {
    // Al volver la red se vacía la cola (el estado `isOffline` lo lleva useSyncExternalStore).
    const onOnline = () => { setSaveFailed(false); void sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [sync])

  // Save a response: try server action, fall back to IndexedDB on network failure
  const saveWithQueue = useCallback(async (
    itemId: string,
    data: ResponseData,
  ): Promise<{ error?: string; queued?: boolean }> => {
    const now = new Date().toISOString()
    // If already known offline, queue immediately
    if (!navigator.onLine) {
      await enqueueResponse({ itrId, itemId, templateId, ...data, queuedAt: now, updatedAt: now })
      setPendingCount(c => c + 1)
      return { queued: true }
    }

    try {
      const res = await upsertResponse({ itrId, itemId, templateId, ...data })
      setSaveFailed(false)
      return res
    } catch {
      // Network error (fetch failed) → queue offline
      await enqueueResponse({ itrId, itemId, templateId, ...data, queuedAt: now, updatedAt: now })
      setPendingCount(c => c + 1)
      setSaveFailed(true)
      return { queued: true }
    }
  }, [itrId, templateId])

  return { isOffline, isOnline: !isOffline, pendingCount, syncing, saveWithQueue, sync }
}