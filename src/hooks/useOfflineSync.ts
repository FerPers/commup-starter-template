'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { enqueueResponse, getAllQueued } from '@/lib/offline-queue'
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
export function useOfflineSync(itrId = '', templateId = '') {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // Load initial pending count from IndexedDB
  useEffect(() => {
    getAllQueued()
      .then(items => {
        const count = itrId
          ? items.filter(i => i.itrId === itrId).length
          : items.length
        setPendingCount(count)
      })
      .catch(() => {})
  }, [itrId])

  // Drain the queue using last-write-wins; conflicts are logged server-side
  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await replayQueueOnce()
      const remaining = await getAllQueued()
      const count = itrId
        ? remaining.filter(i => i.itrId === itrId).length
        : remaining.length
      setPendingCount(count)
    } catch {
      // IndexedDB unavailable — ignore
    }
    syncingRef.current = false
    setSyncing(false)
  }, [itrId])

  // Listen to browser online/offline events
  useEffect(() => {
    const onOnline = () => { setIsOffline(false); void sync() }
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
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
      return res
    } catch {
      // Network error (fetch failed) → queue offline
      await enqueueResponse({ itrId, itemId, templateId, ...data, queuedAt: now, updatedAt: now })
      setPendingCount(c => c + 1)
      setIsOffline(true)
      return { queued: true }
    }
  }, [itrId, templateId])

  return { isOffline, isOnline: !isOffline, pendingCount, syncing, saveWithQueue, sync }
}