'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { enqueueResponse, getAllQueued, removeFromQueue } from '@/lib/offline-queue'
import { createClient } from '@/lib/supabase/client'
import { upsertResponse } from '@/app/actions/itr-instances'

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

  // Process the queue
  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const supabase = createClient()
      const items = await getAllQueued()
      const toSync = itrId ? items.filter(i => i.itrId === itrId) : items
      for (const item of toSync) {
        try {
          // Conflict resolution: check if server has a newer version
          if (item.updatedAt) {
            const { data: serverRow } = await supabase
              .from('itr_responses')
              .select('updated_at')
              .eq('itr_id', item.itrId)
              .eq('item_id', item.itemId)
              .maybeSingle()

            if (serverRow?.updated_at && serverRow.updated_at > item.updatedAt) {
              const useLocal = window.confirm(
                `Conflict detected for item ${item.itemId}. Use your offline version?`,
              )
              if (!useLocal) {
                if (item.id !== undefined) await removeFromQueue(item.id)
                continue
              }
            }
          }

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