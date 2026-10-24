import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }))
vi.mock('@/lib/auth/withAuth', () => ({ withAuth: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(state.ctx, ...args), withAuthOnly: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(state.ctx, ...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/log-activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/notifications/itr-assignment', () => ({ notifyItrAssignmentChanged: vi.fn() }))
import { saveItrAttachment, deleteItrAttachment } from './itr-instances'
type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let removed: string[][]
let failSignatures: boolean
let rpcs: string[]
let failRefresh: boolean
let insertCount: number
function database() {
  return { rpc: async (name: string) => { rpcs.push(name); return { error: failRefresh ? { message: 'timeout' } : null } }, storage: { from: () => ({remove: async (paths: string[]) => { removed.push(paths); return {error:null} }}) }, from(table: string) {
    const filters: [string, unknown][] = []; let operation = 'select'; let payload: Row = {}
    const query = {
      select() { return query }, eq(k: string, v: unknown) { filters.push([k,v]); return query },
      in() { return query }, insert(row: Row) { operation = 'insert'; payload = row; return query },
      delete() { operation = 'delete'; return query },
      update(row: Row) { operation = 'update'; payload = row; return query },
      single() { return execute(true) }, maybeSingle() { return execute(true) },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute(false)).then(resolve) },
    }
    function execute(single: boolean) {
      if (table === 'itr_signatures' && failSignatures) return {data:null,error:{message:'failed'},count:null}
      let rows = (tables[table] ?? []).filter(r => filters.every(([k,v]) => r[k] === v))
      if (operation === 'insert') { insertCount++; const row = {id:`new-${insertCount}`,...payload}; tables[table].push(row); rows=[row] }
      if (operation === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r))
      if (operation === 'update') rows.forEach(r => Object.assign(r,payload))
      return { data: single ? rows[0] ?? null : rows, error: null, count: rows.length }
    }
    return query
  } }
}
beforeEach(() => {
  removed=[]; failSignatures=false; rpcs=[]; failRefresh=false; insertCount=0
  tables = {
    projects: [{id:'p',org_id:'org'}], itrs:[{id:'i',template_id:'tpl',project_id:'p',tag_id:'t',status:'completed',progress_pct:100}],
    itr_assignments: [{role:'executor',user_id:'u',itr_id:'i'},{role:'supervisor',user_id:'s',itr_id:'i'},{role:'client',user_id:'c',itr_id:'i'}],
    itr_signatures: [], work_plan_items: [],
    itr_template_items: [{id:'q',template_id:'tpl',item_type:'text',is_required:true,is_critical:false,requires_photo:false,requires_measurement:false,condition_item_id:null,condition_value:null,options:null}],
    itr_responses: [{itr_id:'i',item_id:'q',value_text:'done',value_numeric:null,value_bool:null,value_option:null,is_passed:null}],
    itr_attachments: [],
  }
  state.ctx = { supabase: database(), orgId:'org',userId:'u' }
})
const upload = {itrId:'i',itemId:'q',storagePath:'p/i/photo.png',fileType:'image/png',projectId:'p',tagId:'t'}
const deletion = {itrId:'i',attachmentId:'a',storagePath:'malicious-other.png',projectId:'p',tagId:'t'}
describe('ITR evidence integrity', () => {
  it('blocks upload after first signature', async () => { tables.itr_signatures.push({itr_id:'i',role:'executor'}); expect((await saveItrAttachment(upload)).error).toBeTruthy(); expect(tables.itr_attachments).toHaveLength(0) })
  it('fails closed on signature lookup error', async () => { failSignatures=true; expect((await saveItrAttachment(upload)).error).toBeTruthy() })
  it('rejects foreign item', async () => { expect((await saveItrAttachment({...upload,itemId:'other'})).error).toBeTruthy() })
  it('rejects mismatched route', async () => { expect((await saveItrAttachment({...upload,tagId:'other'})).error).toBeTruthy() })
  // S05 (C-34): el avance lo recalcula la BD (refresh_itr_status), no la action.
  it('recalculates completion after last photo', async () => { tables.itr_template_items[0].requires_photo=true; tables.itrs[0].status='in_progress'; expect((await saveItrAttachment(upload)).error).toBeUndefined(); expect(rpcs).toEqual(['refresh_itr_status']) })
  it('C-26: rejects capture by someone not assigned as executor', async () => { state.ctx = { ...state.ctx, userId: 'x' }; tables.itrs[0].status='in_progress'; expect((await saveItrAttachment(upload)).error).toMatch(/ejecutor asignado/); expect(tables.itr_attachments).toHaveLength(0) })
  it('blocks deletion after approval', async () => { tables.itrs[0].status='approved'; tables.itr_attachments.push({id:'a',itr_id:'i',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(removed).toHaveLength(0) })
  it('rejects deletion belonging to another ITR', async () => { tables.itr_attachments.push({id:'a',itr_id:'other',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(removed).toHaveLength(0) })
  it('unlinks metadata, preserves immutable binary and recalculates missing evidence', async () => { tables.itr_template_items[0].requires_photo=true; tables.itr_attachments.push({id:'a',itr_id:'i',item_id:'q',file_url:'actual.png',file_type:'image/png'}); expect(await deleteItrAttachment(deletion)).toEqual({}); expect(removed).toHaveLength(0); expect(tables.itr_attachments).toHaveLength(0); expect(rpcs).toEqual(['refresh_itr_status']) })
  it('preserves metadata and binary after a partial signature', async () => { tables.itr_signatures.push({itr_id:'i',role:'executor'}); tables.itr_attachments.push({id:'a',itr_id:'i',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(tables.itr_attachments).toHaveLength(1); expect(removed).toHaveLength(0) })
})

// A02: una captura = un adjunto, aunque se reenvíe o se pierda la respuesta.
describe('ITR evidence identity (A02)', () => {
  const capture = { ...upload, captureId: '0b6f4c1e-8f1a-4c39-9a37-2a4f3f6f9d10', capturedAt: '2026-10-24T06:00:00.000Z' }
  it('diez reenvíos de la misma captura dejan un adjunto', async () => {
    const ids = new Set<string | undefined>()
    for (let i = 0; i < 10; i++) { const res = await saveItrAttachment(capture); expect(res.error).toBeUndefined(); ids.add(res.id) }
    expect(tables.itr_attachments).toHaveLength(1)
    expect(ids.size).toBe(1)
  })
  it('guarda la hora del dispositivo, no la del servidor', async () => {
    await saveItrAttachment(capture)
    expect(tables.itr_attachments[0]).toMatchObject({ capture_id: capture.captureId, captured_at: '2026-10-24T06:00:00.000Z' })
  })
  it('una captura ya guardada vuelve como éxito aunque el ITR se haya firmado después', async () => {
    const first = await saveItrAttachment(capture)
    tables.itr_signatures.push({ itr_id: 'i', role: 'executor' })
    expect(await saveItrAttachment(capture)).toMatchObject({ id: first.id })
    expect(tables.itr_attachments).toHaveLength(1)
  })
  it('un fallo del recálculo de avance no devuelve error (reintentar duplicaría)', async () => {
    failRefresh = true
    const res = await saveItrAttachment(capture)
    expect(res.error).toBeUndefined()
    expect(res.progressStale).toBe(true)
    expect(await saveItrAttachment(capture)).toMatchObject({ id: res.id })
    expect(tables.itr_attachments).toHaveLength(1)
  })
  it('rechaza una captura de otro ITR y un id que no es UUID', async () => {
    tables.itr_attachments.push({ id: 'x', itr_id: 'other', capture_id: capture.captureId })
    expect((await saveItrAttachment(capture)).error).toBeTruthy()
    expect((await saveItrAttachment({ ...capture, captureId: 'nope' })).error).toBeTruthy()
  })
})
