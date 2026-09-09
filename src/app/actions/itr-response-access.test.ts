import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ context: {} as Record<string, unknown> }))
vi.mock('@/lib/auth/withAuth', () => ({
  withAuth: (_options: unknown, handler: (ctx: unknown, input: unknown) => unknown) =>
    (input: unknown) => handler(harness.context, input),
  withAuthOnly: (_options: unknown, handler: unknown) => handler,
}))
vi.mock('@/lib/auth/permissions', () => ({ EDITOR_ROLES: [], PRIVILEGED_ROLES: [] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/log-activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/notifications/itr-assignment', () => ({ notifyItrAssignmentChanged: vi.fn() }))
import { upsertResponse } from './itr-instances'

type Result = { data?: unknown; error?: { message: string } | null; count?: number }
let itr: Result, item: Result, project: Result, existing: Result
let items: Result, responses: Result, attachments: Result, signatures: Result, auditError: boolean
let writes: Array<{ table: string; value: unknown }>
function database() {
  return { from(table: string) {
    let mutation = false
    const query = {
      select: () => query, eq: () => query, limit: () => query,
      delete() { mutation = true; writes.push({ table, value: 'DELETE' }); return query },
      update(value: unknown) { mutation = true; writes.push({ table, value }); return query },
      insert(value: unknown) { mutation = true; writes.push({ table, value }); return query },
      single: async () => result(true), maybeSingle: async () => result(true),
      then(resolve: (value: Result) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    function result(single = false): Result {
      if (mutation) return { error: table === 'activity_log' && auditError ? { message: 'Audit failed' } : null }
      if (table === 'itrs') return itr
      if (table === 'projects') return project
      if (table === 'itr_template_items') return single ? item : items
      if (table === 'itr_responses') return single ? existing : responses
      if (table === 'itr_attachments') return attachments
      if (table === 'itr_signatures') return signatures
      throw new Error(`Unexpected table ${table}`)
    }
    return query
  } }
}
const input = { itrId: 'itr', itemId: 'item', templateId: 'revision-1', valueText: 'Evidence' }
beforeEach(() => {
  itr = { data: { status: 'in_progress', template_id: 'revision-1', project_id: 'project' } }
  item = { data: { template_id: 'revision-1', item_type: 'text', acceptance_min: null, acceptance_max: null }, count: 1 }
  project = { data: { id: 'project' } }
  existing = { data: null, count: 0 }
  items = { data: [field('item')], count: 1 }
  responses = { data: [answer('item', 'Evidence')], count: 1 }
  attachments = { data: [] }
  signatures = { data: [] }
  auditError = false
  writes = []
  harness.context = { supabase: database(), orgId: 'org', userId: 'user' }
})
describe('upsertResponse resolves the authoritative ITR and item before writes', () => {
  it.each(['missing', 'error'])('rejects an ITR lookup that is %s', async kind => {
    itr = kind === 'missing' ? { data: null } : { data: null, error: { message: 'Read failed' } }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('rejects a different revision submitted by the browser', async () => {
    expect((await upsertResponse({ ...input, templateId: 'revision-2' })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('rejects an inaccessible project', async () => {
    project = { data: null }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it.each(['missing', 'error', 'other-template'])('rejects an item lookup that is %s', async kind => {
    item = kind === 'other-template' ? { data: { template_id: 'other' } }
      : { data: null, error: kind === 'error' ? { message: 'Read failed' } : null }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('does not insert when existing-response lookup fails', async () => {
    existing = { data: null, error: { message: 'Read failed' } }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('preserves the approved ITR guard', async () => {
    itr = { data: { status: 'approved', template_id: 'revision-1', project_id: 'project' } }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('accepts the assigned historical revision and preserves partial patches', async () => {
    expect(await upsertResponse({ ...input, valueText: undefined, remarks: 'Review' })).toEqual({})
    expect(writes[0].table).toBe('itr_responses')
    expect(writes[0].value).toMatchObject({ itr_id: 'itr', item_id: 'item', remarks: 'Review' })
    expect(writes[0].value).not.toHaveProperty('value_numeric')
  })
})

function field(id: string, extra = {}) {
  return { id, item_type: 'text', is_required: true, requires_photo: false, requires_measurement: false, options: null, condition_item_id: null, condition_value: null, is_critical: false, ...extra }
}
function answer(id: string, text: string | null, extra = {}) {
  return { item_id: id, value_text: text, value_numeric: null, value_bool: null, value_option: null, is_passed: null, ...extra }
}
function statusWrite() { return writes.find(write => write.table === 'itrs')?.value }
describe('upsertResponse evaluates actual applicable content', () => {
  it('does not complete an empty response row', async () => {
    responses = { data: [answer('item', '  ')], count: 1 }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ status: 'not_started', progress_pct: 0, completed_date: null })
  })
  it('does not round 199 of 200 required answers into completion', async () => {
    items = { data: Array.from({ length: 200 }, (_, i) => field(String(i))), count: 200 }
    responses = { data: Array.from({ length: 199 }, (_, i) => answer(String(i), 'ok')), count: 199 }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ status: 'in_progress', progress_pct: 99, completed_date: null })
  })
  it('excludes hidden required items and their stale critical failure', async () => {
    items = { data: [field('item', { item_type: 'yes_no' }), field('hidden', { condition_item_id: 'item', condition_value: 'true', is_critical: true })], count: 2 }
    responses = { data: [answer('item', null, { value_bool: false }), answer('hidden', null, { is_passed: false })], count: 2 }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ status: 'completed', progress_pct: 100 })
  })
  it('requires a linked photo and completes when its evidence exists', async () => {
    items = { data: [field('item', { requires_photo: true })], count: 1 }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ progress_pct: 0, completed_date: null })
    writes = []
    attachments = { data: [{ item_id: 'item', file_url: 'proof.jpg', file_type: 'image/jpeg' }] }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ status: 'completed', progress_pct: 100 })
  })
  it('rejects applicable critical failure even when other items remain empty', async () => {
    items = { data: [field('item', { is_critical: true }), field('other')], count: 2 }
    responses = { data: [answer('item', 'bad', { is_passed: false })], count: 1 }
    await upsertResponse(input)
    expect(statusWrite()).toMatchObject({ status: 'rejected', completed_date: null })
  })
  it.each(['items', 'responses', 'attachments'])('does not update state when %s reading fails', async table => {
    const failure = { data: null, error: { message: 'Read failed' } }
    if (table === 'items') items = failure
    if (table === 'responses') responses = failure
    if (table === 'attachments') attachments = failure
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(statusWrite()).toBeUndefined()
  })
})

describe('signed content lock and controlled reopening', () => {
  it('blocks edits after the first signature', async () => {
    signatures = { data: [{ id: 'sig', role: 'executor', user_id: 'user' }] }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('fails closed when signature lookup fails', async () => {
    signatures = { data: null, error: { message: 'Read failed' } }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
})

describe('selection outcome authority', () => {
  it('does not trust submitted acceptance for a rejecting option', async () => {
    item = { data: { template_id: 'revision-1', item_type: 'select', options: ['X'], option_outcomes: { X: 'fail' } } }
    expect(await upsertResponse({ ...input, valueOption: 'X', isPassed: true })).toEqual({})
    expect(writes[0].value).toMatchObject({ is_passed: false })
  })
  it('rejects a selection not present in the template', async () => {
    item = { data: { template_id: 'revision-1', item_type: 'select', options: ['X'], option_outcomes: {} } }
    expect((await upsertResponse({ ...input, valueOption: 'Y' })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
})

it('derives continuity acceptance on the server instead of trusting the browser', async () => {
 item = { data: { template_id: 'revision-1', item_type: 'continuity' } }
 const valueText = JSON.stringify({ version: 1, grouping: 'conductors', count: 1, shields: [], measurementRequired: false, rows: [{ id: 'C1', from: 'A', to: 'B', result: 'fail', remarks: '', reading: null, unit: '' }] })
 await upsertResponse({ ...input, valueText, isPassed: true })
 expect(writes.find(w => w.table === 'itr_responses')?.value).toMatchObject({ is_passed: false })
})
it('rejects malformed continuity before writing a response', async () => {
 item = { data: { template_id: 'revision-1', item_type: 'continuity' } }
 expect((await upsertResponse({ ...input, valueText: '{}' })).error).toBeTruthy()
 expect(writes).toEqual([])
})
