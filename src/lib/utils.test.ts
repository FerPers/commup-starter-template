import { describe, expect, it } from 'vitest'
import { detectItrPhase, formatPercent } from './utils'

describe('detectItrPhase (nemotecnia <Disc><Nº><Etapa>)', () => {
  it('sufijo C → C', () => {
    expect(detectItrPhase('E13C')).toBe('C')
    expect(detectItrPhase('m09c')).toBe('C')
    expect(detectItrPhase('I05C-2')).toBe('C')
  })
  it('sufijo B / BV → B', () => {
    expect(detectItrPhase('E13B')).toBe('B')
    expect(detectItrPhase('E24BV')).toBe('B')
    expect(detectItrPhase('P02B-1')).toBe('B')
  })
  it('resto → A', () => {
    expect(detectItrPhase('E13A')).toBe('A')
    expect(detectItrPhase('Q07')).toBe('A')
    expect(detectItrPhase('AUTOTEST-001')).toBe('A')
  })
})

describe('formatPercent', () => {
  it('redondea y agrega %', () => {
    expect(formatPercent(40)).toBe('40%')
    expect(formatPercent(66.66)).toBe('67%')
    expect(formatPercent(0)).toBe('0%')
  })
})
