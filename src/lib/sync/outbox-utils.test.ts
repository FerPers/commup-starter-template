import { describe, expect, it } from 'vitest'
import { isNetworkFailure, localAttachmentId, parseLocalAttachmentId, storagePathFor } from './outbox-utils'

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
