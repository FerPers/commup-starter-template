import { describe, expect, it } from 'vitest'
import { countByOwner, ownershipOf, sendableBy, totalOwned } from './ownership'

describe('capturas sin red por usuario (S18)', () => {
  const rows = [{ capturedBy: 'a' }, { capturedBy: 'b' }, {}, { capturedBy: null }, { capturedBy: 'a' }]

  it('propia, de otra persona o sin autor (versión anterior)', () => {
    expect(ownershipOf({ capturedBy: 'a' }, 'a')).toBe('mine')
    expect(ownershipOf({ capturedBy: 'a' }, 'b')).toBe('other')
    expect(ownershipOf({ capturedBy: 'a' }, null)).toBe('other')
    expect(ownershipOf({}, 'a')).toBe('legacy')
  })

  it('el replay envía solo lo propio y nada sin sesión', () => {
    expect(sendableBy(rows, 'a')).toHaveLength(2)
    expect(sendableBy(rows, 'b')).toEqual([{ capturedBy: 'b' }])
    expect(sendableBy(rows, null)).toEqual([])
  })

  it('cuenta por dueño', () => {
    const c = countByOwner(rows, 'a')
    expect(c).toEqual({ mine: 2, legacy: 2, other: 1 })
    expect(totalOwned(c)).toBe(5)
  })
})
