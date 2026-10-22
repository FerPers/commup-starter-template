import { describe, expect, it } from 'vitest'
import { parseSystemTab, systemTabHref } from './file-tabs'

describe('ficha de sistema única (N2a)', () => {
  it('pestaña de la URL, Gates por defecto', () => {
    expect(parseSystemTab({})).toBe('gates')
    expect(parseSystemTab({ tab: 'deps' })).toBe('deps')
    expect(parseSystemTab({ tab: ['plan', 'x'] })).toBe('plan')
    expect(parseSystemTab({ tab: 'bogus', gate: 'g1' })).toBe('gates')
  })

  it('enlaces: Gates sin parámetro', () => {
    expect(systemTabHref('p', 's', 'gates')).toBe('/projects/p/systems/s')
    expect(systemTabHref('p', 's', 'vendors')).toBe('/projects/p/systems/s?tab=vendors')
  })
})
