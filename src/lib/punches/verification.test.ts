import { describe, expect, it } from 'vitest'
import { punchDisplayStatus, punchVerificationRights } from './verification'

describe('verificación en campo del punch', () => {
  it('«resuelto» es in_progress con resolved_at', () => {
    expect(punchDisplayStatus({ status: 'in_progress', resolved_at: '2026-10-16T10:00:00Z' })).toBe('resolved')
    expect(punchDisplayStatus({ status: 'in_progress', resolved_at: null })).toBe('in_progress')
    expect(punchDisplayStatus({ status: 'closed', resolved_at: '2026-10-16T10:00:00Z' })).toBe('closed')
  })

  it('verifica otra persona; quien resolvió espera', () => {
    const p = { status: 'in_progress', resolved_at: '2026-10-16T10:00:00Z', resolved_by: 'u1' }
    expect(punchVerificationRights(p, 'u2', 'inspector')).toMatchObject({ canVerify: true, waitingOther: false, canResolve: false })
    expect(punchVerificationRights(p, 'u1', 'leader')).toMatchObject({ canVerify: false, waitingOther: true })
  })

  it('el cliente puede verificar pero no resolver', () => {
    expect(punchVerificationRights({ status: 'open' }, 'c', 'client').canResolve).toBe(false)
    expect(punchVerificationRights({ status: 'in_progress', resolved_at: 'x', resolved_by: 'u1' }, 'c', 'client').canVerify).toBe(true)
  })
})
