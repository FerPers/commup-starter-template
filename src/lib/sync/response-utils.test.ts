import { describe, expect, it } from 'vitest'
import { expectedVersion, overlayQueued, responseHeld, responseValueLabel } from './response-utils'

describe('cola de respuestas con compare-and-set (S18 sesión 2)', () => {
  const a1 = { id: 1, itrId: 'i', itemId: 'a', expectedRespondedAt: 'v1' }
  const a2 = { id: 2, itrId: 'i', itemId: 'a', expectedRespondedAt: 'v1' }
  const b1 = { id: 3, itrId: 'i', itemId: 'b', expectedRespondedAt: null }

  it('la segunda edición de la misma casilla usa la versión que dejó la primera', () => {
    const written = new Map([['i:a', 'v2']])
    expect(expectedVersion(a1, new Map())).toBe('v1')
    expect(expectedVersion(a2, written)).toBe('v2')
    expect(expectedVersion(b1, written)).toBeNull()
  })

  it('«Aplicar la mía» y las entradas de antes de S18 no comprueban versión', () => {
    expect(expectedVersion({ ...a1, force: true }, new Map())).toBeUndefined()
    expect(expectedVersion({ id: 9, itrId: 'i', itemId: 'z' }, new Map())).toBeUndefined()
  })

  it('un conflicto retiene las ediciones posteriores de esa casilla, no las demás', () => {
    const all = [{ ...a1, state: 'conflict' as const }, a2, b1]
    expect(responseHeld(all[0], all)).toBe(true)
    expect(responseHeld(a2, all)).toBe(true)
    expect(responseHeld(b1, all)).toBe(false)
  })

  it('superpone lo encolado sobre el servidor y muestra valores legibles', () => {
    const merged = overlayQueued({ item_id: 'a', value_text: 'viejo', is_passed: true }, [{ valueText: 'nuevo' }, { isPassed: false } as never])
    expect(merged).toMatchObject({ item_id: 'a', value_text: 'nuevo', is_passed: false })
    const labels = { yes: 'Sí', no: 'No', empty: '—' }
    expect(responseValueLabel({ valueBool: false }, labels)).toBe('No')
    expect(responseValueLabel({ valueNumeric: 0 }, labels)).toBe('0')
    expect(responseValueLabel({}, labels)).toBe('—')
  })
})
