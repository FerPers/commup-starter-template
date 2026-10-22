import { describe, expect, it } from 'vitest'
import { isScopeAll, legacyProject, scopeAllHref } from './scope'

describe('listas con alcance (N2c)', () => {
  it('«Todos los proyectos» vive en la ruta del proyecto con ?scope=all y conserva los filtros', () => {
    expect(scopeAllHref('p1', 'itrs')).toBe('/projects/p1/itrs?scope=all')
    expect(scopeAllHref('p1', 'punches', new URLSearchParams('assigned=me&scope=x'))).toBe('/projects/p1/punches?scope=all&assigned=me')
  })
  it('alcance y proyecto de los enlaces viejos', () => {
    expect(isScopeAll('all')).toBe(true)
    expect(isScopeAll(undefined)).toBe(false)
    expect(legacyProject(['a', 'b'], 'b')).toBe('b')
    expect(legacyProject(['a'], 'zzz')).toBeNull()
  })
})
