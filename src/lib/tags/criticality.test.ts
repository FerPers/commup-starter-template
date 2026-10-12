import { describe, expect, it } from 'vitest'
import { hasSil, isCriticality, parseCriticality, parseSilLevel, suggestCriticality } from './criticality'

describe('parseCriticality', () => {
  it('reconoce español e inglés, con o sin tildes', () => {
    expect(parseCriticality('Seguridad')).toBe('safety')
    expect(parseCriticality('Safety-Critical')).toBe('safety')
    expect(parseCriticality('crítico de proceso')).toBe('process')
    expect(parseCriticality('PROCESO')).toBe('process')
    expect(parseCriticality('normal')).toBe('normal')
    expect(parseCriticality('No crítico')).toBe('normal')
  })

  it('vacío o desconocido → undefined', () => {
    expect(parseCriticality('')).toBeUndefined()
    expect(parseCriticality('   ')).toBeUndefined()
    expect(parseCriticality(undefined)).toBeUndefined()
    expect(parseCriticality('alta')).toBeUndefined()
  })
})

describe('parseSilLevel / hasSil / suggestCriticality', () => {
  it('normaliza formatos comunes', () => {
    expect(parseSilLevel('SIL 2')).toBe('SIL2')
    expect(parseSilLevel('3')).toBe('SIL3')
    expect(parseSilLevel('sil-1')).toBe('SIL1')
    expect(parseSilLevel('N/A')).toBe('None')
    expect(parseSilLevel('')).toBeUndefined()
    expect(parseSilLevel('alto')).toBeUndefined()
  })

  it('SIL declarado sugiere seguridad; None no', () => {
    expect(hasSil('SIL2')).toBe(true)
    expect(hasSil('None')).toBe(false)
    expect(hasSil(null)).toBe(false)
    expect(suggestCriticality('SIL1')).toBe('safety')
    expect(suggestCriticality('None')).toBeNull()
  })

  it('isCriticality', () => {
    expect(isCriticality('safety')).toBe(true)
    expect(isCriticality('alta')).toBe(false)
  })
})
