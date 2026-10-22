/**
 * N2c («Maquetas N2», decisiones de Luis 2026-10-21): «Tags y equipos» tiene tres modos en `?view=`:
 * Lista (por defecto), Árbol (el antiguo Explorador) y Tarjetas (el antiguo Digital Twin).
 * Al cambiar de modo se conservan los filtros que los modos comparten (búsqueda, sistema, subsistema).
 */
export const TAG_VIEWS = ['list', 'tree', 'cards'] as const
export type TagView = (typeof TAG_VIEWS)[number]

export function parseTagView(v: string | string[] | undefined | null): TagView {
  const s = Array.isArray(v) ? v[0] : v
  return s && (TAG_VIEWS as readonly string[]).includes(s) ? (s as TagView) : 'list'
}

const SHARED = ['q', 'subsystem', 'system'] as const

/** Query string del modo `view` conservando los filtros compartidos de `current`. */
export function tagViewQuery(current: URLSearchParams, view: TagView): string {
  const next = new URLSearchParams()
  if (view !== 'list') next.set('view', view)
  for (const k of SHARED) {
    const v = current.get(k)
    if (v) next.set(k, v)
  }
  const qs = next.toString()
  return qs ? `?${qs}` : ''
}
