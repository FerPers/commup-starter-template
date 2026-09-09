import { describe, expect, it } from 'vitest'
import { availableSigningRoles } from './types'
describe('availableSigningRoles', () => {
  const assignments = [{ role: 'executor', user_id: 'a' }, { role: 'supervisor', user_id: 'b' }, { role: 'client', user_id: 'c' }]
  it('permits only the assigned user at the next signing level', () => {
    expect(availableSigningRoles(assignments, [], 'a')).toEqual(['executor'])
    expect(availableSigningRoles(assignments, [], 'b')).toEqual([])
    expect(availableSigningRoles(assignments, [{ role: 'executor', user_id: 'a' }], 'b')).toEqual(['supervisor'])
    expect(availableSigningRoles(assignments, [{ role: 'executor', user_id: 'wrong' }], 'b')).toEqual([])
  })
  it('does not allow signing twice, bypassing order or ambiguous assignments', () => {
    expect(availableSigningRoles(assignments, [{ role: 'executor', user_id: 'a' }], 'a')).toEqual([])
    expect(availableSigningRoles(assignments, [{ role: 'supervisor', user_id: 'b' }], 'c')).toEqual([])
    expect(availableSigningRoles([...assignments, { role: 'executor', user_id: 'other' }], [], 'a')).toEqual([])
  })
})
