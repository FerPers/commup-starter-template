/**
 * Helpers de paginación/orden para listas servidas por página (Sprint E).
 * Sin dependencias de servidor ni cliente: se usan en page.tsx y en vistas.
 */

export const LIST_PAGE_SIZE = 50
export const LIST_MAX_SEARCH = 100

export type SortDir = 'asc' | 'desc'

/** Página 1-based; valores inválidos → 1 */
export function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export function parseSort<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback
}

export function parseDir(raw: string | undefined, fallback: SortDir): SortDir {
  return raw === 'asc' || raw === 'desc' ? raw : fallback
}

/** Rango inclusivo [from, to] para supabase .range() */
export function rangeFor(page: number, size = LIST_PAGE_SIZE): [number, number] {
  const from = (page - 1) * size
  return [from, from + size - 1]
}

/**
 * Normaliza el texto de búsqueda para un ilike seguro (sin comodines del usuario).
 * C-25/A-24 (S02): el texto se interpola en filtros `.or()` de PostgREST, donde `,` `(` `)` `"` y `*`
 * son sintaxis: `A,B` rompía la consulta y `x,id.not.is.null` añadía condiciones. Esos caracteres pasan
 * a `_` (comodín de UN carácter), así `PT-101(A)` sigue encontrando el tag sin tocar la sintaxis.
 */
export function normalizeSearch(raw: string | undefined): string {
  const q = (raw ?? '').trim().slice(0, LIST_MAX_SEARCH)
  return q.replace(/[%_\\]/g, ' ').replace(/[,()"*]/g, '_').replace(/\s+/g, ' ').trim()
}

export function totalPages(total: number, size = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
