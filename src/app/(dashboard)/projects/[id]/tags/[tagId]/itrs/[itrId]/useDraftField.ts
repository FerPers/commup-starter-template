'use client'

// C-19: campo escrito del ITR con borrador local (reglas en draft.ts). El campo es controlado: sin
// router.refresh() tras cada guardado, sigue al valor del servidor solo cuando no hay nada sin guardar.

import { useCallback, useEffect, useState } from 'react'
import { DRAFT_DELAY_MS, draftController } from './draft'

// Bloquear el teléfono o pasar a otra app dispara visibilitychange (hidden); cerrar o navegar, pagehide.
// Un solo par de escuchas para todos los campos montados.
const flushers = new Set<() => void>()
let listening = false
function flushAll() { for (const flush of flushers) flush() }
function listen() {
  if (listening) return
  listening = true
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() })
}

export function useDraftField(saved: string, commit: (value: string) => void, delay = DRAFT_DELAY_MS) {
  const [ctl] = useState(() => draftController(saved, commit, delay))
  useEffect(() => { ctl.setCommit(commit) })
  const [value, setValue] = useState(saved)

  // Valor nuevo del servidor (conflicto resuelto, respuesta encolada superpuesta): se muestra si no hay nada
  // escrito sin guardar (ajuste durante el render; el controlador se entera en el efecto).
  const [lastSaved, setLastSaved] = useState(saved)
  if (saved !== lastSaved) {
    setLastSaved(saved)
    if (!ctl.dirty) setValue(saved)
  }
  useEffect(() => { ctl.serverValue(saved) }, [ctl, saved])

  const flush = useCallback(() => { ctl.flush() }, [ctl])
  useEffect(() => {
    listen()
    flushers.add(flush)
    return () => { flushers.delete(flush); flush() }
  }, [flush])

  const change = useCallback((next: string) => { setValue(next); ctl.change(next) }, [ctl])

  return { value, change, flush }
}
