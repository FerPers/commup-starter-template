import { describe, expect, it } from 'vitest'
import { availableSigningRoles } from './types'

const ALL = ['executor', 'supervisor', 'client']
describe('availableSigningRoles', () => {
  const assignments = [{ role: 'executor', user_id: 'a' }, { role: 'supervisor', user_id: 'b' }, { role: 'client', user_id: 'c' }]
  it('permits only the assigned user at the next signing level', () => {
    expect(availableSigningRoles(ALL, assignments, [], 'a')).toEqual(['executor'])
    expect(availableSigningRoles(ALL, assignments, [], 'b')).toEqual([])
    expect(availableSigningRoles(ALL, assignments, [{ role: 'executor', user_id: 'a' }], 'b')).toEqual(['supervisor'])
    expect(availableSigningRoles(ALL, assignments, [{ role: 'executor', user_id: 'wrong' }], 'b')).toEqual([])
  })
  it('does not allow signing twice, bypassing order or ambiguous assignments', () => {
    expect(availableSigningRoles(ALL, assignments, [{ role: 'executor', user_id: 'a' }], 'a')).toEqual([])
    expect(availableSigningRoles(ALL, assignments, [{ role: 'supervisor', user_id: 'b' }], 'c')).toEqual([])
    expect(availableSigningRoles(ALL, [...assignments, { role: 'executor', user_id: 'other' }], [], 'a')).toEqual([])
  })
  it('skips roles the ITR does not require (S04)', () => {
    expect(availableSigningRoles(['executor', 'client'], assignments, [{ role: 'executor', user_id: 'a' }], 'c')).toEqual(['client'])
    expect(availableSigningRoles(['executor', 'supervisor'], assignments, [{ role: 'executor', user_id: 'a' }, { role: 'supervisor', user_id: 'b' }], 'c')).toEqual([])
  })
})
