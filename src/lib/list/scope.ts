/**
 * N2c (decisión de Luis 2026-10-21): una lista por objeto con alcance «Este proyecto / Todos los proyectos».
 * La vista de todos vive en la ruta del proyecto con `?scope=all` (las rutas globales viejas redirigen aquí).
 */
export const SCOPED_LISTS = ['itrs', 'punches', 'certificates', 'work-plans', 'preservation'] as const
export type ScopedList = (typeof SCOPED_LISTS)[number]

/** Lista global vieja → lista del proyecto. */
export const LEGACY_GLOBAL: Record<string, ScopedList> = {
  '/itrs': 'itrs', '/punch-list': 'punches', '/certificates': 'certificates', '/work-plans': 'work-plans', '/preservation': 'preservation',
}

export function isScopeAll(scope: string | string[] | undefined): boolean {
  return (Array.isArray(scope) ? scope[0] : scope) === 'all'
}

/** «Todos los proyectos» desde un proyecto, conservando los filtros (y el `project` si venía uno). */
export function scopeAllHref(projectId: string, list: ScopedList, params: URLSearchParams = new URLSearchParams()): string {
  const next = new URLSearchParams(params)
  next.delete('scope')
  const qs = next.toString()
  return `/projects/${projectId}/${list}?scope=all${qs ? `&${qs}` : ''}`
}

/** Proyecto desde el que se abre la vista de todos: el de `?project=` si es de la org. */
export function legacyProject(projectIds: readonly string[], param: string | undefined | null): string | null {
  return param && projectIds.includes(param) ? param : null
}
