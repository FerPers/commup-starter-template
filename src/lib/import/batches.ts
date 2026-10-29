/**
 * Importación por lotes desde el cliente (S07, C-24/F-23): una server action por lote de ~1000 filas
 * en vez del archivo entero (límite de 5 MB del body y de CPU del Worker), con progreso.
 */
export const IMPORT_BATCH = 1000

/** Última fila gana por clave (la revisión más reciente en la hoja), conservando el orden. */
export function dedupeLast<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    map.delete(k)
    map.set(k, row)
  }
  return [...map.values()]
}

export type BatchErrors = { row: number; tag: string; reason: string }[]

/**
 * Corre `send` lote a lote. Los números de fila que devuelve el servidor son relativos al lote: se
 * corrigen con el desplazamiento. Se detiene en el primer error de la action (no de fila).
 */
export async function runBatches<R extends { errors: BatchErrors }>(
  rows: readonly unknown[],
  send: (batch: unknown[]) => Promise<{ error?: string; result?: R }>,
  merge: (acc: R | null, next: R) => R,
  onProgress?: (done: number, total: number) => void,
  size = IMPORT_BATCH,
): Promise<{ error?: string; result: R | null }> {
  let acc: R | null = null
  for (let offset = 0; offset < rows.length; offset += size) {
    const batch = rows.slice(offset, offset + size)
    // Una action que lanza (Worker caído, red, despliegue nuevo) no puede dejar el asistente en «Importando…».
    let res: { error?: string; result?: R }
    try { res = await send(batch) } catch (e) { res = { error: `Sin respuesta del servidor (${e instanceof Error ? e.message : String(e)}). Recarga la página (puede haber una versión nueva) y vuelve a intentar.` } }
    if (res.error || !res.result) return { error: res.error ?? 'Sin respuesta del servidor', result: acc }
    const shifted = { ...res.result, errors: res.result.errors.map(e => ({ ...e, row: e.row + offset })) }
    acc = merge(acc, shifted)
    onProgress?.(Math.min(offset + size, rows.length), rows.length)
  }
  return { result: acc }
}

/** Suma campo a campo los contadores numéricos y concatena listas (warnings sin repetir). */
export function mergeCounts<R extends { errors: BatchErrors; warnings: string[] }>(acc: R | null, next: R): R {
  if (!acc) return next
  const out = { ...acc } as Record<string, unknown>
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === 'number') out[k] = ((acc as Record<string, unknown>)[k] as number ?? 0) + v
  }
  out.errors = [...acc.errors, ...next.errors]
  out.warnings = [...new Set([...acc.warnings, ...next.warnings])]
  return out as R
}
