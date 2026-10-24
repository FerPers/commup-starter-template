'use client'

// Hook de autosave de la ejecución de ITR (Q2, extraído de ItrExecution.tsx):
// estado optimista de responses (snake_case, espejo de la fila en DB) + cola
// offline + re-sync con props cuando otra acción recarga la página.
// C-19: guardar ya no recarga la página entera; la acción devuelve lo que dejó la BD (versión, is_passed,
// estado y avance) y solo eso se aplica en local.

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { getAllQueued, OUTBOX_CHANGED_EVENT } from '@/lib/offline-queue'
import { currentUserId } from '@/lib/sync/owner'
import { sendableBy } from '@/lib/sync/ownership'
import { overlayQueued } from '@/lib/sync/response-utils'
import type { ItrData, Response, SaveData } from './types'

// Campos de un patch y su columna (camelCase de la acción → snake_case de la fila).
const PATCH_FIELDS = [
  ['valueText', 'value_text'], ['valueNumeric', 'value_numeric'], ['valueBool', 'value_bool'],
  ['valueOption', 'value_option'], ['remarks', 'remarks'], ['isPassed', 'is_passed'],
] as const

export function useItrAutosave(itr: ItrData) {
  const [isPending, startTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSavesRef = useRef(0)

  const { isOffline, pendingCount, syncing, saveWithQueue } = useOfflineSync(itr.id, itr.template_id)

  // S18 (C-38): ya no se guarda una copia del ITR en IndexedDB en cada cambio (nunca se leía); sin red la
  // pantalla sale de la caché de páginas del SW y lo encolado se superpone abajo (C-09).

  // Versión (`responded_at`) de cada casilla tal como la ve la pantalla: viaja con lo encolado (compare-and-set).
  const versionsRef = useRef<Record<string, string | null>>({})
  useEffect(() => {
    const v: Record<string, string | null> = {}
    for (const r of itr.itr_responses) v[r.item_id] = r.responded_at
    versionsRef.current = v
  }, [itr.itr_responses])

  // Build response lookup by item_id. Re-sync when server data changes after
  // router.refresh() so server-side computed fields (e.g. defensive is_passed)
  // become visible without a hard reload.
  const [responses, setResponsesState] = useState<Record<string, Response>>(() => {
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    return map
  })
  // Espejo síncrono para decidir en saveResponse si algo cambió (el estado de React llega en el próximo render).
  const responsesRef = useRef(responses)
  const setResponses = useCallback((update: (prev: Record<string, Response>) => Record<string, Response>) => {
    responsesRef.current = update(responsesRef.current)
    setResponsesState(responsesRef.current)
  }, [])
  useEffect(() => {
    if (pendingSavesRef.current > 0) return
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    setResponses(() => map)
  }, [itr.itr_responses, setResponses])

  // Estado del ITR que devolvió la BD tras el último guardado; vale mientras la página no traiga otro.
  const [saved, setSaved] = useState<{ base: string; status: string } | null>(null)
  const itrStatus = saved && saved.base === itr.status ? saved.status : itr.status

  // S18 (C-09): al recargar (o al cambiar la bandeja) se superponen las respuestas propias aún encoladas de este
  // ITR, para que quien trabaja sin red vea lo que ya capturó.
  useEffect(() => {
    let alive = true
    const apply = async () => {
      // Las que están en conflicto no: la casilla muestra el valor del servidor y la bandeja deja decidir.
      const queued = sendableBy(await getAllQueued(), await currentUserId()).filter(q => q.itrId === itr.id && q.state !== 'conflict')
      if (!alive || queued.length === 0) return
      setResponses(prev => {
        const next = { ...prev }
        for (const itemId of new Set(queued.map(q => q.itemId))) {
          const mine = queued.filter(q => q.itemId === itemId).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
          next[itemId] = overlayQueued(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }, mine) as Response
        }
        return next
      })
    }
    const onChange = () => { apply().catch(() => {}) }
    onChange()
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChange)
    return () => { alive = false; window.removeEventListener(OUTBOX_CHANGED_EVENT, onChange) }
  }, [itr.id, itr.itr_responses, setResponses])

  // Guardados en vuelo por casilla: el eco del servidor solo se aplica cuando no queda otro detrás.
  const pendingByItemRef = useRef<Record<string, number>>({})

  const saveResponse = useCallback((itemId: string, data: SaveData) => {
    setSaveError(null)
    // Map camelCase patch → snake_case so state matches DB shape and reads
    // via response?.value_numeric / is_passed work consistently.
    const patch: Partial<Response> = {}
    for (const [key, column] of PATCH_FIELDS) {
      if (key in data) (patch as Record<string, unknown>)[column] = data[key] ?? null
    }
    // C-19: lo que ya está en la casilla no se vuelve a guardar (salir del campo, tocar el mismo «Sí»).
    const current = responsesRef.current[itemId]
    if (Object.entries(patch).every(([column, value]) => (current?.[column as keyof Response] ?? null) === value)) return
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }), ...patch },
    }))
    // Preserve every edit, including another field changed during an in-flight save.
    // Refresh only after the queue drains, so earlier server snapshots do not erase
    // optimistic edits that have not reached the server yet.
    pendingSavesRef.current += 1
    pendingByItemRef.current[itemId] = (pendingByItemRef.current[itemId] ?? 0) + 1
    const task = saveQueueRef.current.then(async () => {
      try {
        const res = await saveWithQueue(itemId, data, versionsRef.current[itemId] ?? null)
        if (res.error) { setSaveError(res.error); return }
        if (res.respondedAt) versionsRef.current[itemId] = res.respondedAt
        if (res.queued) return
        setLastSaved(new Date())
        if (res.status) setSaved({ base: itr.status, status: res.status })
        // Lo que decidió la BD (versión; is_passed de medición, selección, tabla o continuidad), salvo que haya
        // otro guardado de la misma casilla detrás: ese trae su propio eco.
        if (pendingByItemRef.current[itemId] === 1) {
          setResponses(prev => ({
            ...prev,
            [itemId]: {
              ...(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }),
              ...(res.respondedAt ? { responded_at: res.respondedAt } : {}),
              ...(res.isPassed !== undefined ? { is_passed: res.isPassed } : {}),
            } as Response,
          }))
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la respuesta')
      } finally {
        pendingSavesRef.current -= 1
        pendingByItemRef.current[itemId] -= 1
      }
    })
    saveQueueRef.current = task
    startTransition(async () => { await task })
  }, [saveWithQueue, setResponses, itr.status])

  return { responses, saveResponse, lastSaved, saveError, isPending, isOffline, pendingCount, syncing, itrStatus }
}
