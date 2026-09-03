import { describe, expect, it } from 'vitest'
import { normalizeCode, normalizePidRef, textOr, textOrNull } from './normalize'

describe('normalize (referencias por texto)', () => {
  it('normalizePidRef: mayúsculas, espacios colapsados, null si vacío', () => {
    expect(normalizePidRef(' p&id-001 ')).toBe('P&ID-001')
    expect(normalizePidRef('PID   001')).toBe('PID 001')
    expect(normalizePidRef('')).toBeNull()
    expect(normalizePidRef(undefined)).toBeNull()
  })
  it('normalizeCode: fallback cuando viene vacío', () => {
    expect(normalizeCode(' sys-01 ', 'GEN')).toBe('SYS-01')
    expect(normalizeCode(null, 'GEN-SYS')).toBe('GEN-SYS')
  })
  it('textOrNull / textOr', () => {
    expect(textOrNull('  ')).toBeNull()
    expect(textOrNull(' x ')).toBe('x')
    expect(textOr(undefined, 'def')).toBe('def')
    expect(textOr(42, 'def')).toBe('42')
  })
})
