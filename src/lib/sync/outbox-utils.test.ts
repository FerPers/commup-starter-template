import { describe, expect, it } from 'vitest'
import { isNetworkFailure, localAttachmentId, localItrStatus, outboxPolicy, parseLocalAttachmentId, storagePathFor } from './outbox-utils'

describe('local attachment ids', () => {
  it('round-trips an outbox id', () => {
    expect(localAttachmentId(42)).toBe('local:42')
    expect(parseLocalAttachmentId('local:42')).toBe(42)
  })
  it('rejects real (uuid) ids and garbage', () => {
    expect(parseLocalAttachmentId('3f2a…')).toBeNull()
    expect(parseLocalAttachmentId('local:abc')).toBeNull()
  })
})

describe('isNetworkFailure', () => {
  it('is true whenever the browser reports offline', () => {
    expect(isNetworkFailure(new Error('anything'), false)).toBe(true)
  })
  it('recognises fetch/network errors when online', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure(new Error('network error'), true)).toBe(true)
    expect(isNetworkFailure({ message: 'Load failed' }, true)).toBe(false) // objeto sin Error: solo string/Error se inspeccionan
    expect(isNetworkFailure('connection reset', true)).toBe(true)
  })
  it('treats server rejections as logical errors', () => {
    expect(isNetworkFailure(new Error('Access denied'), true)).toBe(false)
    expect(isNetworkFailure(new Error('new row violates row-level security policy'), true)).toBe(false)
  })
})

describe('storagePathFor', () => {
  it('scopes by itr and item, keeps the extension', () => {
    const p = storagePathFor('itr1', 'item9', 'IMG_0001.HEIC', 1000)
    expect(p.startsWith('itr1/item9/1000-')).toBe(true)
    expect(p.endsWith('.HEIC')).toBe(true)
  })
  it('uses the general folder without item', () => {
    expect(storagePathFor('itr1', null, 'a.jpg', 1)).toMatch(/^itr1\/general\/1-[a-z0-9]+\.jpg$/)
  })
})

describe('outboxPolicy (conflictos al sincronizar)', () => {
  it('retries photos and punches twice, drops on the third rejection', () => {
    expect(outboxPolicy('photo', 0)).toBe('retry')
    expect(outboxPolicy('photo', 1)).toBe('retry')
    expect(outboxPolicy('photo', 2)).toBe('drop')
    expect(outboxPolicy('punch', 2)).toBe('drop')
  })
  it('drops a signature on the first rejection (ITR changed state meanwhile)', () => {
    expect(outboxPolicy('signature', 0)).toBe('drop')
  })
})

describe('localItrStatus (espejo del servidor)', () => {
  const items = [
    { id: 'a', is_critical: true },
    { id: 'b', is_critical: false },
    { id: 'c', is_critical: false },
  ]
  it('not_started without responses', () => {
    expect(localItrStatus(items, {})).toEqual({ pct: 0, status: 'not_started' })
  })
  it('in_progress with partial responses, counting any saved response', () => {
    expect(localItrStatus(items, { a: { is_passed: true } })).toEqual({ pct: 33, status: 'in_progress' })
  })
  it('completed at 100% without critical failures', () => {
    expect(localItrStatus(items, { a: { is_passed: true }, b: {}, c: { is_passed: null } })).toEqual({ pct: 100, status: 'completed' })
  })
  it('rejected at 100% when a critical item failed', () => {
    expect(localItrStatus(items, { a: { is_passed: false }, b: {}, c: {} })).toEqual({ pct: 100, status: 'rejected' })
  })
  it('a failed non-critical item does not reject', () => {
    expect(localItrStatus(items, { a: { is_passed: true }, b: { is_passed: false }, c: {} }).status).toBe('completed')
  })
})
