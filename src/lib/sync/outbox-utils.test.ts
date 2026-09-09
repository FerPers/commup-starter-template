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

describe('localItrStatus (validación de contenido)', () => {
  const items = ['a', 'b', 'c'].map(id => ({ id, item_type: 'text' as const, is_required: true, is_critical: id === 'a', requires_photo: false, requires_measurement: false, condition_item_id: null, condition_value: null, options: null }))
  it('not_started without responses', () => {
    expect(localItrStatus(items, {})).toEqual({ pct: 0, status: 'not_started' })
  })
  it('does not count empty saved rows', () => {
    expect(localItrStatus(items, { a: {}, b: {}, c: {} }).status).not.toBe('completed')
  })
  it('counts actual content', () => {
    expect(localItrStatus(items, { a: { value_text: 'dato' } })).toEqual({ pct: 33, status: 'in_progress' })
  })
  it('completes only when requirements are satisfied', () => {
    expect(localItrStatus(items, { a: { value_text: 'a' }, b: { value_text: 'b' }, c: { value_text: 'c' } })).toEqual({ pct: 100, status: 'completed' })
  })
  it('preserves explicit critical rejection', () => {
    expect(localItrStatus(items, { a: { value_text: 'a', is_passed: false }, b: { value_text: 'b' }, c: { value_text: 'c' } }).status).toBe('rejected')
  })
  it('never rounds a missing required answer to 100', () => {
    const many = Array.from({ length: 200 }, (_, n) => ({ ...items[0], id: String(n) }))
    const responses = Object.fromEntries(many.slice(0, 199).map(item => [item.id, { value_text: 'dato' }]))
    expect(localItrStatus(many, responses).pct).toBeLessThan(100)
    expect(localItrStatus(many, responses).status).toBe('in_progress')
  })
})
