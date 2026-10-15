import { describe, expect, it } from 'vitest'
import { DISCIPLINE_EXAMPLES, PUNCH_IMPACTS, categoryMismatch, examplesFor, startupDispositionBlockers } from './category-guide'

describe('guía de categorización de punch', () => {
  it('sugiere por impacto y avisa solo si difiere', () => {
    expect(categoryMismatch('safety', 'A')).toBeNull()
    expect(categoryMismatch('safety', 'C')).toBe('A')
    expect(categoryMismatch('operability', 'B')).toBe('C')
    expect(categoryMismatch(null, 'C')).toBeNull()
  })

  it('ejemplos por disciplina con respaldo genérico y en ambos idiomas', () => {
    expect(examplesFor('pipe')).toBe(DISCIPLINE_EXAMPLES.PIPE)
    expect(examplesFor('XYZ')).toBe(DISCIPLINE_EXAMPLES.GENERIC)
    for (const ex of Object.values(DISCIPLINE_EXAMPLES)) {
      for (const cat of ['A', 'B', 'C'] as const) {
        expect(ex[cat].length).toBeGreaterThan(0)
        for (const t of ex[cat]) expect(t.es && t.en).toBeTruthy()
      }
    }
    expect(PUNCH_IMPACTS).toHaveLength(5)
  })

  it('PSSR: sin disposición o «cerrar antes del arranque» abiertos bloquean', () => {
    const r = startupDispositionBlockers([
      { id: 1, startup_disposition: null },
      { id: 2, startup_disposition: 'close_before_startup' },
      { id: 3, startup_disposition: 'controls' },
      { id: 4, startup_disposition: 'long_term' },
    ])
    expect(r.missing.map(p => p.id)).toEqual([1])
    expect(r.mustClose.map(p => p.id)).toEqual([2])
  })
})
