/**
 * Lectura completa por lotes (Sprint E). PostgREST devuelve como máximo 1000
 * filas por petición; los reportes y exportaciones que necesitan TODO el
 * proyecto deben paginar con .range() hasta agotar. Tope duro para no agotar
 * memoria en Workers.
 *
 * S09 (B-08): el helper agrega siempre un orden por una clave única (`key`, por defecto `id`) al
 * final del orden que traiga la consulta: sin él, dos páginas de `.range()` pueden repetir u omitir
 * filas. Superar `maxRows` ya no corta en silencio: lanza `TruncatedError` (o, con
 * `fetchAllRowsFlagged`, devuelve `truncated: true` para que la pantalla lo diga).
 */

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
type Rangeable<T> = { range: (from: number, to: number) => Page<T> }
type Orderable<T> = Rangeable<T> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- los builders de PostgREST tienen órdenes sobrecargados y genéricos por columna
  order: (column: any, options?: any) => Rangeable<T>
}

export type FetchAllOptions = { batch?: number; maxRows?: number; key?: string }

export const DEFAULT_MAX_ROWS = 50_000

export class TruncatedError extends Error {
  constructor(public readonly maxRows: number) {
    super(`La consulta supera ${maxRows.toLocaleString('es')} filas; acote el filtro o use una exportación por partes.`)
    this.name = 'TruncatedError'
  }
}

export async function fetchAllRowsFlagged<T>(
  build: () => Orderable<T>,
  opts: FetchAllOptions = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const batch = opts.batch ?? 1000
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS
  const key = opts.key ?? 'id'
  const out: T[] = []
  for (let from = 0; ; from += batch) {
    const { data, error } = await build().order(key, { ascending: true }).range(from, from + batch - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (out.length > maxRows) return { rows: out.slice(0, maxRows), truncated: true }
    if (rows.length < batch) return { rows: out, truncated: false }
  }
}

export async function fetchAllRows<T>(build: () => Orderable<T>, opts: FetchAllOptions = {}): Promise<T[]> {
  const { rows, truncated } = await fetchAllRowsFlagged(build, opts)
  if (truncated) throw new TruncatedError(opts.maxRows ?? DEFAULT_MAX_ROWS)
  return rows
}
