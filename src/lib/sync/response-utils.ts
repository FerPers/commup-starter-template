/**
 * S18 sesión 2 (C-35/B-16, decisión de Luis 2026-10-20) — reglas puras de la cola de respuestas de ITR.
 * Sin imports de Next ni Supabase para testearlas en vitest.
 *
 * Cada respuesta encolada guarda la versión de la fila que vio el dispositivo (`expectedRespondedAt`, el
 * `responded_at` del servidor; null = no había respuesta). Al sincronizar, upsertResponse escribe solo si la fila
 * sigue igual (compare-and-set); si otra persona la cambió, la entrada queda en «conflicto» con el valor actual y
 * decide el usuario: «Aplicar la mía» (se envía sin comprobar) o «Descartar» (rastro en sync_conflicts).
 * Ya no se comparan relojes. La hora de campo viaja como `capturedAt` y la BD la acota.
 */

/** Estado de la casilla en el servidor cuando el compare-and-set falla. */
export type ResponseConflict = {
  respondedAt: string | null
  respondedBy: string | null
  valueText: string | null
  valueNumeric: number | null
  valueBool: boolean | null
  valueOption: string | null
  remarks: string | null
  isPassed: boolean | null
}

export type ResponseQueueState = 'pending' | 'conflict'

export type ResponseQueueLike = {
  id?: number
  itrId: string
  itemId: string
  /** undefined = entrada de antes de S18 (se envía sin comprobar versión). */
  expectedRespondedAt?: string | null
  state?: ResponseQueueState
  force?: boolean
}

export const responseKey = (r: { itrId: string; itemId: string }) => `${r.itrId}:${r.itemId}`

/** Retenida: está en conflicto o hay una anterior de la misma casilla en conflicto (el orden por casilla es estricto). */
export function responseHeld(entry: ResponseQueueLike, all: readonly ResponseQueueLike[]): boolean {
  if (entry.state === 'conflict') return true
  const key = responseKey(entry)
  return all.some(o => o.state === 'conflict' && responseKey(o) === key && (o.id ?? 0) < (entry.id ?? 0))
}

/**
 * Versión a comprobar al enviar. Si una entrada anterior de la misma casilla ya se escribió en este replay, la
 * versión es la que devolvió el servidor (si no, la segunda edición sin red chocaría con la primera).
 * undefined = no comprobar («Aplicar la mía» o entrada de antes de S18).
 */
export function expectedVersion(entry: ResponseQueueLike, written: ReadonlyMap<string, string>): string | null | undefined {
  if (entry.force || entry.expectedRespondedAt === undefined) return undefined
  return written.get(responseKey(entry)) ?? entry.expectedRespondedAt
}

type ValueLike = { valueText?: string | null; valueNumeric?: number | null; valueBool?: boolean | null; valueOption?: string | null }

/** Valor legible de una respuesta (para mostrar «tu valor» frente al actual en un conflicto). */
export function responseValueLabel(v: ValueLike, labels: { yes: string; no: string; empty: string }): string {
  if (v.valueOption != null && v.valueOption !== '') return v.valueOption
  if (v.valueNumeric != null) return String(v.valueNumeric)
  if (v.valueBool != null) return v.valueBool ? labels.yes : labels.no
  if (v.valueText != null && v.valueText !== '') return v.valueText.length > 60 ? `${v.valueText.slice(0, 57)}…` : v.valueText
  return labels.empty
}

/** Superpone, en orden, los campos encolados sobre la respuesta del servidor (C-09: al recargar se ven). */
export function overlayQueued<T extends Record<string, unknown>>(
  base: T | undefined,
  queued: ReadonlyArray<ValueLike & { remarks?: string | null; isPassed?: boolean | null }>,
): Partial<T> & Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base ?? {}) }
  for (const q of queued) {
    if ('valueText' in q) out.value_text = q.valueText ?? null
    if ('valueNumeric' in q) out.value_numeric = q.valueNumeric ?? null
    if ('valueBool' in q) out.value_bool = q.valueBool ?? null
    if ('valueOption' in q) out.value_option = q.valueOption ?? null
    if ('remarks' in q) out.remarks = q.remarks ?? null
    if ('isPassed' in q) out.is_passed = q.isPassed ?? null
  }
  return out as Partial<T> & Record<string, unknown>
}
