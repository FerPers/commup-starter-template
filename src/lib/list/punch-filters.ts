import type { PunchListFilters } from './punch-query'

// G-14: filtros de la lista de punch ↔ URL, compartidos por la pantalla y el Excel (que exporta lo filtrado).

export const PUNCH_FILTER_KEYS = ['cat', 'status', 'disc', 'system', 'q', 'project', 'assigned', 'phase'] as const

/** Filtros de la lista tal como van en la URL (`assigned=me` → la persona en sesión). */
export function punchFiltersFromSearch(sp: URLSearchParams, userId: string): PunchListFilters {
  const f: PunchListFilters = {}
  for (const k of PUNCH_FILTER_KEYS) {
    const v = sp.get(k)
    if (v) f[k] = v
  }
  f.assigned = f.assigned === 'me' ? userId : undefined
  return f
}

/** Query string con los filtros vigentes, para el enlace de exportación. */
export function punchFiltersQuery(filters: Partial<Record<typeof PUNCH_FILTER_KEYS[number], string>>): string {
  const params = new URLSearchParams()
  for (const k of PUNCH_FILTER_KEYS) if (filters[k]) params.set(k, filters[k]!)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
