import { describe, expect, it } from 'vitest'
import { inactiveState, isActiveMembership } from './catalog'

describe('membresías (S15, I-21)', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  it('activa solo si status active y no venció', () => {
    expect(isActiveMembership({ status: 'active', access_expires_at: null }, now)).toBe(true)
    expect(isActiveMembership({ status: 'active', access_expires_at: '2026-10-21T00:00:00Z' }, now)).toBe(true)
    expect(isActiveMembership({ status: 'active', access_expires_at: '2026-10-20T11:59:00Z' }, now)).toBe(false)
    expect(isActiveMembership({ status: 'invited', access_expires_at: null }, now)).toBe(false)
    expect(isActiveMembership({ status: 'suspended', access_expires_at: null }, now)).toBe(false)
  })
  it('motivo de no acceso', () => {
    expect(inactiveState({ status: 'invited', access_expires_at: null }, now)).toBe('invited')
    expect(inactiveState({ status: 'suspended', access_expires_at: null }, now)).toBe('suspended')
    expect(inactiveState({ status: 'active', access_expires_at: '2026-01-01T00:00:00Z' }, now)).toBe('expired')
    expect(inactiveState({ status: 'active', access_expires_at: null }, now)).toBeNull()
  })
})
