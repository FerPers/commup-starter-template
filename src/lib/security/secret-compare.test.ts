import { describe, expect, it } from 'vitest'
import { hasBearerSecret, timingSafeEqualStr } from './secret-compare'

describe('comparación de secretos (A-27)', () => {
  it('igual solo si coinciden byte a byte', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStr('', '')).toBe(true)
    expect(timingSafeEqualStr('ñ', 'n')).toBe(false)
  })
  it('Bearer del cron', () => {
    expect(hasBearerSecret('Bearer s3cret', 's3cret')).toBe(true)
    expect(hasBearerSecret('Bearer s3cre', 's3cret')).toBe(false)
    expect(hasBearerSecret(null, 's3cret')).toBe(false)
  })
})
