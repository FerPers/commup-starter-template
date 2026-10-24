// C-19: borrador de un campo escrito del ITR (texto, número, medición, fecha, observación). Guarda ~1 s después de
// dejar de escribir, al salir del campo y cuando la página se oculta (bloquear el teléfono, cambiar de app, cerrar
// la pestaña). No guarda si el valor es el último guardado o recibido. Lógica pura: el hook está en useDraftField.

export const DRAFT_DELAY_MS = 1000

type Timers = {
  set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clear: (id: ReturnType<typeof setTimeout>) => void
}

export type DraftController = {
  /** Lo que escribió la persona: (re)programa el guardado. */
  change: (value: string) => void
  /** Guarda ya si hay algo distinto de lo guardado; true si llamó a `commit`. */
  flush: () => boolean
  /** El servidor (o la cola sin red) trae un valor nuevo: lo sigue solo si no hay nada sin guardar. */
  serverValue: (value: string) => void
  /** Quién guarda (el hook lo actualiza en cada render). */
  setCommit: (commit: (value: string) => void) => void
  /** Hay un guardado programado (lo escrito todavía no salió). */
  readonly dirty: boolean
  readonly value: string
}

export function draftController(
  initial: string,
  commit: (value: string) => void = () => {},
  delay = DRAFT_DELAY_MS,
  timers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) },
): DraftController {
  let value = initial
  let saved = initial
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer !== null) { timers.clear(timer); timer = null }
    if (value === saved) return false
    saved = value
    commit(value)
    return true
  }

  return {
    change(next) {
      value = next
      if (timer !== null) timers.clear(timer)
      timer = timers.set(flush, delay)
    },
    flush,
    setCommit(next) { commit = next },
    serverValue(next) {
      if (timer === null) value = next
      saved = next
    },
    get dirty() { return timer !== null },
    get value() { return value },
  }
}
