/**
 * Lectura completa por lotes (Sprint E). PostgREST devuelve como máximo 1000
 * filas por petición; los reportes y exportaciones que necesitan TODO el
 * proyecto deben paginar con .range() hasta agotar. Tope duro para no agotar
 * memoria en Workers.
 */

type Rangeable<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

export async function fetchAllRows<T>(
  build: () => Rangeable<T>,
  opts: { batch?: number; maxRows?: number } = {},
): Promise<T[]> {
  const batch = opts.batch ?? 1000
  const maxRows = opts.maxRows ?? 50_000
  const out: T[] = []
  for (let from = 0; out.length < maxRows; from += batch) {
    const { data, error } = await build().range(from, from + batch - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < batch) break
  }
  return out.slice(0, maxRows)
}
