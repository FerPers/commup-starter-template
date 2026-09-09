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
function database() {
  return { storage: { from: () => ({remove: async (paths: string[]) => { removed.push(paths); return {error:null} }}) }, from(table: string) {
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
      if (operation === 'insert') { const row = {id:'new',...payload}; tables[table].push(row); rows=[row] }
      if (operation === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r))
      if (operation === 'update') rows.forEach(r => Object.assign(r,payload))
      return { data: single ? rows[0] ?? null : rows, error: null, count: rows.length }
    }
    return query
  } }
}
beforeEach(() => {
  removed=[]; failSignatures=false
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
  it('recalculates completion after last photo', async () => { tables.itr_template_items[0].requires_photo=true; tables.itrs[0].status='in_progress'; tables.itrs[0].progress_pct=0; expect((await saveItrAttachment(upload)).error).toBeUndefined(); expect(tables.itrs[0].status).toBe('completed'); expect(tables.itrs[0].progress_pct).toBe(100) })
  it('blocks deletion after approval', async () => { tables.itrs[0].status='approved'; tables.itr_attachments.push({id:'a',itr_id:'i',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(removed).toHaveLength(0) })
  it('rejects deletion belonging to another ITR', async () => { tables.itr_attachments.push({id:'a',itr_id:'other',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(removed).toHaveLength(0) })
  it('unlinks metadata, preserves immutable binary and recalculates missing evidence', async () => { tables.itr_template_items[0].requires_photo=true; tables.itr_attachments.push({id:'a',itr_id:'i',item_id:'q',file_url:'actual.png',file_type:'image/png'}); expect(await deleteItrAttachment(deletion)).toEqual({}); expect(removed).toHaveLength(0); expect(tables.itr_attachments).toHaveLength(0); expect(tables.itrs[0].status).toBe('in_progress'); expect(tables.itrs[0].progress_pct).toBe(0) })
  it('preserves metadata and binary after a partial signature', async () => { tables.itr_signatures.push({itr_id:'i',role:'executor'}); tables.itr_attachments.push({id:'a',itr_id:'i',file_url:'actual.png'}); expect((await deleteItrAttachment(deletion)).error).toBeTruthy(); expect(tables.itr_attachments).toHaveLength(1); expect(removed).toHaveLength(0) })
})
