import { describe, expect, it } from 'vitest'
import { linkLabel, matrixGaps, nextSeq, normalizeCeCode, parseDelay } from './matrix'

describe('matriz C&E', () => {
  it('normaliza códigos', () => {
    expect(normalizeCeCode('  c-01 ')).toBe('C-01')
    expect(normalizeCeCode('e  1')).toBe('E 1')
    expect(normalizeCeCode('   ')).toBeNull()
    expect(normalizeCeCode('x'.repeat(31))).toBeNull()
  })

  it('interpreta el retardo de un cruce', () => {
    expect(parseDelay('')).toEqual({ link_type: 'direct', delay_s: null })
    expect(parseDelay('5')).toEqual({ link_type: 'delayed', delay_s: 5 })
    expect(parseDelay('0,5')).toEqual({ link_type: 'delayed', delay_s: 0.5 })
    expect(parseDelay('-1')).toHaveProperty('error')
    expect(parseDelay('abc')).toHaveProperty('error')
  })

  it('numera y detecta huecos', () => {
    expect(nextSeq([])).toBe(10)
    expect(nextSeq([{ seq: 10 }, { seq: 30 }])).toBe(40)
    const gaps = matrixGaps([{ id: 'c1' }, { id: 'c2' }], [{ id: 'e1' }, { id: 'e2' }], [{ cause_id: 'c1', effect_id: 'e1' }])
    expect(gaps).toEqual({ causesWithoutEffect: ['c2'], effectsWithoutCause: ['e2'] })
  })

  it('etiqueta las celdas', () => {
    expect(linkLabel(undefined)).toBe('')
    expect(linkLabel({ link_type: 'direct', delay_s: null })).toBe('X')
    expect(linkLabel({ link_type: 'delayed', delay_s: 5 })).toBe('T5s')
  })
})
