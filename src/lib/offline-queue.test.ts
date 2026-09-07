// Prueba la capa IndexedDB real (fake-indexeddb en Node): stores, versión 3,
// bandeja de salida y contador unificado.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  countPending, enqueueOutbox, enqueueResponse, getAllQueued, getOutbox,
  markOutboxAttempt, removeFromOutbox,
} from './offline-queue'

async function resetDb() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('commup-offline')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

describe('offline outbox (IndexedDB)', () => {
  beforeEach(resetDb)

  it('enqueues photos and punches in capture order and returns ids', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const a = await enqueueOutbox({ kind: 'photo', itrId: 'itr1', itemId: 'i1', projectId: 'p', tagId: 't', fileName: 'a.jpg', fileType: 'image/jpeg', blob })
    const b = await enqueueOutbox({ kind: 'punch', itrId: 'itr1', projectId: 'p', tagId: 't', category: 'B', description: 'fuga', targetDate: null })
    expect(b).toBeGreaterThan(a)

    const rows = await getOutbox()
    expect(rows.map(r => r.kind)).toEqual(['photo', 'punch'])
    expect(rows[0].attempts).toBe(0)
    expect(rows[0].queuedAt).toMatch(/^\d{4}-/)
  })

  it('counts responses + outbox, optionally per ITR', async () => {
    const now = new Date().toISOString()
    await enqueueResponse({ itrId: 'itr1', itemId: 'x', templateId: 'tpl', valueBool: true, queuedAt: now })
    await enqueueOutbox({ kind: 'punch', itrId: 'itr1', projectId: 'p', tagId: 't', category: 'A', description: 'd', targetDate: null })
    await enqueueOutbox({ kind: 'punch', itrId: 'itr2', projectId: 'p', tagId: 't', category: 'C', description: 'd', targetDate: null })

    expect(await countPending()).toBe(3)
    expect(await countPending('itr1')).toBe(2)
    expect(await countPending('itr2')).toBe(1)
    expect((await getAllQueued()).length).toBe(1)
  })

  it('marks attempts and removes entries', async () => {
    const id = await enqueueOutbox({ kind: 'punch', itrId: 'itr1', projectId: 'p', tagId: 't', category: 'B', description: 'd', targetDate: null })
    await markOutboxAttempt(id, 'Access denied')
    await markOutboxAttempt(id, 'Access denied')
    const [row] = await getOutbox()
    expect(row.attempts).toBe(2)
    expect(row.lastError).toBe('Access denied')

    await removeFromOutbox(id)
    expect(await getOutbox()).toEqual([])
    expect(await countPending()).toBe(0)
  })
})
