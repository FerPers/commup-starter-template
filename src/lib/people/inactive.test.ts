import { describe, expect, it } from 'vitest'
import { isInactiveMember, memberIdSet } from './inactive'

describe('memberIdSet', () => {
  it('builds a set from user_id rows and tolerates null', () => {
    expect(memberIdSet([{ user_id: 'a' }, { user_id: 'b' }])).toEqual(new Set(['a', 'b']))
    expect(memberIdSet(null)).toEqual(new Set())
    expect(memberIdSet(undefined).size).toBe(0)
  })
})

describe('isInactiveMember', () => {
  const members = new Set(['a', 'b'])

  it('is false for current members', () => {
    expect(isInactiveMember('a', members)).toBe(false)
  })

  it('is true for a known user who is no longer a member', () => {
    expect(isInactiveMember('zz', members)).toBe(true)
  })

  it('is false when the user id is unknown (nothing to assert)', () => {
    expect(isInactiveMember(null, members)).toBe(false)
    expect(isInactiveMember(undefined, members)).toBe(false)
    expect(isInactiveMember('', members)).toBe(false)
  })

  it('treats an empty member set as everyone inactive', () => {
    expect(isInactiveMember('a', new Set())).toBe(true)
  })
})
