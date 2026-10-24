import { beforeEach, describe, expect, it, vi } from 'vitest'

// A01 (revisión 2026-10-23): un rechazo del servidor nunca debe borrar del dispositivo una captura cuyo rastro no
// quedó guardado, ni una foto (sync_conflicts guarda metadatos, no los bytes).
const h = vi.hoisted(() => ({
  responses: [] as Array<Record<string, unknown>>,
  outbox: [] as Array<Record<string, unknown>>,
  removedResponses: [] as number[],
  removedOutbox: [] as number[],
  responseAttempts: [] as number[],
  outboxAttempts: [] as number[],
  logError: null as { message: string } | null,
  logs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/offline-queue', () => ({
  getAllQueued: async () => h.responses.filter(r => !h.removedResponses.includes(r.id as number)),
  getOutbox: async () => h.outbox.filter(e => !h.removedOutbox.includes(e.id as number)),
  removeFromQueue: async (id: number) => { h.removedResponses.push(id) },
  removeFromOutbox: async (id: number) => { h.removedOutbox.push(id) },
  markResponseAttempt: async (id: number) => { h.responseAttempts.push(id) },
  markOutboxAttempt: async (id: number) => { h.outboxAttempts.push(id) },
  patchResponseEntry: async () => {},
  notifyOutboxChanged: () => {},
  SYNC_DONE_EVENT: 'done', SYNC_DROPPED_EVENT: 'dropped',
}))
vi.mock('@/lib/sync/outbox', () => ({
  uploadPhoto: async () => ({ error: 'permiso denegado' }),
  sendPunch: async () => ({ error: 'no' }),
  isNetworkFailure: () => false,
}))
vi.mock('@/lib/sync/owner', () => ({ currentUserId: async () => 'u' }))
vi.mock('@/lib/sync/ownership', () => ({ sendableBy: <T,>(rows: T[]) => rows }))
vi.mock('@/lib/sync/startup-outbox', () => ({ replayStartupOnce: async () => ({ flushed: 0, issues: 0, remaining: 0 }) }))
vi.mock('@/app/actions/itr-instances', () => ({
  upsertResponse: async () => ({ error: 'ITR firmado' }),
  signItr: async () => ({ error: 'ITR aprobado' }),
}))
vi.mock('@/app/actions/punches', () => ({ createPunch: async () => ({ error: 'no' }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: async (_name: string, args: Record<string, unknown>) => { h.logs.push(args); return { error: h.logError } } }),
}))

import { replayQueueOnce } from './replay'

const base = { itrId: 'itr', capturedBy: 'u', queuedAt: '2026-10-24T10:00:00Z', projectId: 'p', tagId: 't' }
const response = (attempts: number) => ({ ...base, id: 1, itemId: 'item', templateId: 'tpl', valueText: 'medido', attempts })
const photo = (attempts: number) => ({ ...base, id: 7, kind: 'photo', itemId: 'item', fileName: 'f.jpg', fileType: 'image/jpeg', blob: { size: 42 }, attempts })
const signature = { ...base, id: 9, kind: 'signature', role: 'executor', signatureImage: 'data:', attempts: 0 }

beforeEach(() => {
  h.responses = []; h.outbox = []
  h.removedResponses = []; h.removedOutbox = []; h.responseAttempts = []; h.outboxAttempts = []
  h.logError = null; h.logs = []
})

describe('replay: capturas rechazadas (A01)', () => {
  it('una respuesta que agotó intentos se descarta solo si su rastro quedó en sync_conflicts', async () => {
    h.responses = [response(2)]
    const res = await replayQueueOnce()
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ p_entity_type: 'itr_response', p_local_payload: { valueText: 'medido' } })
    expect(h.removedResponses).toEqual([1])
    expect(res).toMatchObject({ conflicts: 1, remaining: 0 })
  })

  it('si registrar el rastro falla, la respuesta se queda en el dispositivo', async () => {
    h.responses = [response(2)]
    h.logError = { message: 'audit storage failed' }
    const res = await replayQueueOnce()
    expect(h.removedResponses).toEqual([])
    expect(h.responseAttempts).toEqual([1])
    expect(res.remaining).toBe(1)
  })

  it('una foto rechazada nunca se borra sola: queda en «No sincronizado» con su error', async () => {
    h.outbox = [photo(5)]
    const res = await replayQueueOnce()
    expect(h.removedOutbox).toEqual([])
    expect(h.outboxAttempts).toEqual([7])
    expect(h.logs).toEqual([])
    expect(res.remaining).toBe(1)
  })

  it('una firma rechazada se descarta con rastro; si el rastro falla, se queda', async () => {
    h.outbox = [signature]
    h.logError = { message: 'audit storage failed' }
    expect((await replayQueueOnce()).remaining).toBe(1)
    expect(h.removedOutbox).toEqual([])

    h.logError = null
    expect((await replayQueueOnce()).remaining).toBe(0)
    expect(h.removedOutbox).toEqual([9])
  })
})
