import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-redirect'

describe('safeNextPath (A-18)', () => {
  it('acepta rutas relativas del sitio', () => {
    expect(safeNextPath('/auth/set-password', '/dashboard')).toBe('/auth/set-password')
    expect(safeNextPath('/projects/1?tab=itrs', '/dashboard')).toBe('/projects/1?tab=itrs')
  })
  it('rechaza destinos fuera del sitio', () => {
    for (const bad of ['https://evil.tld', '//evil.tld', '/\\evil.tld', 'javascript:alert(1)', 'evil.tld', '/\tevil', '/a\\b']) {
      expect(safeNextPath(bad, '/dashboard')).toBe('/dashboard')
    }
  })
  it('usa el respaldo si no hay next', () => {
    expect(safeNextPath(null, '/dashboard')).toBe('/dashboard')
    expect(safeNextPath('', '/x')).toBe('/x')
  })
})
