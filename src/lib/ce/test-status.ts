// Estado de prueba de lazos y causas C&E (fase 4 · bloque D, sesión 2). Lógica pura que comparten la
// pantalla de lazos, la matriz C&E y las acciones de generación.

import { evaluateTable, parseSourceRows, type SourceRow } from '@/lib/itr/table'

export type SourceItr = {
  id: string
  itr_number: string
  status: string
  tag_id: string | null
  created_at: string
  source_rows: unknown
}

/** Resultado de un cruce (o de una señal) según la fila de la tabla del ITR. */
export type RowResult = 'pass' | 'fail' | 'pending'

/** El ITR vigente de un lazo o causa: el más reciente (las revisiones R2… reemplazan a las anteriores). */
export function latestItr<T extends { created_at: string }>(itrs: T[]): T | null {
  return itrs.reduce<T | null>((best, itr) => (!best || itr.created_at > best.created_at ? itr : best), null)
}

/** ¿La foto del ITR ya no coincide con el lazo o la matriz actuales? (señales/efectos o sus datos cambiaron). */
export function isOutdated(stored: unknown, current: unknown): boolean {
  const a = parseSourceRows(stored)
  const b = parseSourceRows(current)
  if (!a || !b) return false
  return canonical(a) !== canonical(b)
}

function canonical(rows: SourceRow[]): string {
  return JSON.stringify(rows.map(r => [r.key, r.label, Object.keys(r.refs).sort().map(k => [k, r.refs[k] ?? null])]))
}

/**
 * Resultado por fila (clave de la señal o del efecto) de la tabla `source` de un ITR. La fila cuenta como
 * aprobada solo si la tabla la acepta y su columna «Resultado» (la última de tipo resultado) dice pass.
 */
export function rowResults(
  items: Array<{ id: string; item_type: string; options: unknown }>,
  responses: Array<{ item_id: string; value_text: string | null }>,
  sourceRowsRaw: unknown,
): Map<string, RowResult> {
  const out = new Map<string, RowResult>()
  const sourceRows = parseSourceRows(sourceRowsRaw)
  if (!sourceRows) return out
  for (const row of sourceRows) out.set(row.key, 'pending')
  const item = items.find(i => i.item_type === 'table' && (i.options as { rows?: { mode?: string } } | null)?.rows?.mode === 'source')
  if (!item) return out
  const value = responses.find(r => r.item_id === item.id)?.value_text ?? null
  const evaluation = evaluateTable(item.options, value, sourceRows)
  if (!evaluation.data || !evaluation.config) return out
  const resultCols = evaluation.config.columns.filter(c => c.type === 'result')
  const main = resultCols[resultCols.length - 1]
  evaluation.data.rows.forEach((row, i) => {
    const key = sourceRows[i].key
    const flags = evaluation.rowFlags[row.id]
    if (flags?.fail || resultCols.some(c => row.cells[c.key] === 'fail')) out.set(key, 'fail')
    else if (main && row.cells[main.key] === 'pass') out.set(key, 'pass')
  })
  return out
}

export const ITR_STATUS_LABELS: Record<string, string> = {
  not_started: 'Sin iniciar', in_progress: 'En curso', completed: 'Completado', approved: 'Aprobado', rejected: 'Rechazado', on_hold: 'En espera',
}
