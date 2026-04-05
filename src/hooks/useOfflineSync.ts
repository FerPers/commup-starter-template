'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { enqueueResponse, getAllQueued, removeFromQueue } from '@/lib/offline-queue'
import { upsertResponse } from '@/app/actions/itr-instances'

type ResponseData = {
  valueText?: string | null
  valueNumeric?: number | null
  valueBool?: boolean | null
  valueOption?: string | null
  remarks?: string | null
  isPassed?: boolean | null
}

export function useOfflineSync(itrId: string, templateId: string) {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // Load initial pending count from IndexedDB
  useEffect(() => {
    getAllQueued()
      .then(items => setPendingCount(items.filter(i => i.itrId === itrId).length))
      .catch(() => {})
  }, [itrId])

  // Process the queue
  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const items = await getAllQueued()
      const mine = items.filter(i => i.itrId === itrId)
      for (const item of mine) {
        try {
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
          if (!res.error && item.id !== undefined) {
            await removeFromQueue(item.id)
          }
        } catch {
          // Network still unavailable — leave item in queue
          break
        }
      }
      const remaining = await getAllQueued()
      setPendingCount(remaining.filter(i => i.itrId === itrId).length)
    } catch {
      // IndexedDB unavailable — ignore
    }
    syncingRef.current = false
    setSyncing(false)
  }, [itrId])

  // Listen to browser online/offline events
  useEffect(() => {
    const onOnline = () => { setIsOffline(false); sync() }
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
    // If already known offline, queue immediately
    if (!navigator.onLine) {
      await enqueueResponse({ itrId, itemId, templateId, ...data, queuedAt: new Date().toISOString() })
      setPendingCount(c => c + 1)
      return { queued: true }
    }

    try {
      const res = await upsertResponse({ itrId, itemId, templateId, ...data })
      return res
    } catch {
      // Network error (fetch failed) → queue offline
      await enqueueResponse({ itrId, itemId, templateId, ...data, queuedAt: new Date().toISOString() })
      setPendingCount(c => c + 1)
      setIsOffline(true)
      return { queued: true }
    }
  }, [itrId, templateId])

  return { isOffline, pendingCount, syncing, saveWithQueue, sync }
}