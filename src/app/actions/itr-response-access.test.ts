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
let items: Result, responses: Result, attachments: Result, signatures: Result, auditError: boolean, assignment: Result
let writes: Array<{ table: string; value: unknown }>
let rpcs: Array<{ name: string; args: unknown }>
let rpcError: { message: string } | null
const refreshed = { status: 'in_progress', progress_pct: 50 }
// C-19: la acción devuelve lo que dejó la BD (estado, avance, is_passed) para no recargar la página.
const SAVED = { isPassed: null, status: 'in_progress', progressPct: 50 }
function database() {
  return { rpc: async (name: string, args: unknown) => { rpcs.push({ name, args }); return { data: rpcError ? null : refreshed, error: rpcError } }, from(table: string) {
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
      if (table === 'itr_assignments') return assignment
      throw new Error(`Unexpected table ${table}`)
    }
    return query
  } }
}
const input = { itrId: 'itr', itemId: 'item', templateId: 'revision-1', valueText: 'Evidence' }
beforeEach(() => {
  itr = { data: { status: 'in_progress', template_id: 'revision-1', project_id: 'project', projects: { org_id: 'org' } } }
  item = { data: { template_id: 'revision-1', item_type: 'text', acceptance_min: null, acceptance_max: null }, count: 1 }
  project = { data: { id: 'project' } }
  existing = { data: null, count: 0 }
  items = { data: [field('item')], count: 1 }
  responses = { data: [answer('item', 'Evidence')], count: 1 }
  attachments = { data: [] }
  signatures = { data: [] }
  auditError = false
  assignment = { data: { id: 'a' } }
  rpcs = []
  rpcError = null
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
  it('rejects a project of another organization', async () => {
    itr = { data: { status: 'in_progress', template_id: 'revision-1', project_id: 'project', projects: { org_id: 'other-org' } } }
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
    itr = { data: { status: 'approved', template_id: 'revision-1', project_id: 'project', projects: { org_id: 'org' } } }
    expect((await upsertResponse(input)).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('accepts the assigned historical revision and preserves partial patches', async () => {
    expect(await upsertResponse({ ...input, valueText: undefined, remarks: 'Review' })).toEqual(SAVED)
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
// S05 (C-34, D7): el estado y el avance los recalcula la BD (refresh_itr_status → evaluate_itr_capture). La
// evaluación del contenido se prueba en src/lib/itr/completion.test.ts y en la BD (tests/db).
describe('upsertResponse delega el estado en la BD', () => {
  it('no escribe itrs: llama refresh_itr_status después de guardar la respuesta', async () => {
    expect(await upsertResponse(input)).toEqual(SAVED)
    expect(writes.find(w => w.table === 'itrs')).toBeUndefined()
    expect(rpcs).toEqual([{ name: 'refresh_itr_status', args: { p_itr_id: 'itr' } }])
  })
  it('B-15: la pertenencia del proyecto viaja embebida en la lectura del ITR (sin consulta aparte)', async () => {
    project = { data: null }
    expect(await upsertResponse(input)).toEqual(SAVED)
  })
  it('informa si no se pudo recalcular el avance', async () => {
    rpcError = { message: 'boom' }
    expect((await upsertResponse(input)).error).toMatch(/avance/)
  })
  it('C-26: solo el ejecutor asignado (o un supervisor) captura', async () => {
    assignment = { data: null }
    expect((await upsertResponse(input)).error).toMatch(/ejecutor asignado/)
    expect(writes).toEqual([])
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
    expect(await upsertResponse({ ...input, valueOption: 'X', isPassed: true })).toEqual(SAVED)
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

describe('compare-and-set de respuestas sin red (S18 sesión 2)', () => {
  const row = { id: 'r1', value_text: 'Oficina', value_option: null, value_numeric: null, value_bool: null, remarks: null, is_passed: null, responded_at: 'v2', responded_by: 'otra' }

  it('si alguien creó la casilla después, devuelve el valor actual sin escribir', async () => {
    existing = { data: row }
    const res = await upsertResponse({ ...input, expectedRespondedAt: null })
    expect(res.conflict).toMatchObject({ valueText: 'Oficina', respondedBy: 'otra', respondedAt: 'v2' })
    expect(writes.filter(w => w.table === 'itr_responses')).toEqual([])
  })

  it('si la versión cambió, el UPDATE condicionado no toca filas y devuelve conflicto', async () => {
    existing = { data: row }
    const res = await upsertResponse({ ...input, expectedRespondedAt: 'v1', capturedAt: '2026-10-20T10:00:00Z' })
    expect(res.conflict?.valueText).toBe('Oficina')
    expect(rpcs.some(r => r.name === 'refresh_itr_status')).toBe(false)
  })

  it('sin versión (en línea / «Aplicar la mía») escribe y manda la hora de captura', async () => {
    existing = { data: row }
    const res = await upsertResponse({ ...input, capturedAt: '2026-10-20T10:00:00Z' })
    expect(res.conflict).toBeUndefined()
    expect(writes.find(w => w.table === 'itr_responses')?.value).toMatchObject({ value_text: 'Evidence', captured_at: '2026-10-20T10:00:00Z' })
  })
})
