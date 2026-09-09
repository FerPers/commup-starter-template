import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }))
vi.mock('@/lib/auth/withAuth', () => ({ withAuth: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(state.ctx, ...args), withAuthOnly: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(state.ctx, ...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/log-activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/notifications/itr-assignment', () => ({ notifyItrAssignmentChanged: vi.fn() }))
import { signItr, revokeItrApproval } from './itr-instances'
type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let rpcResult: { data: unknown; error: { message: string } | null }
let rpc: ReturnType<typeof vi.fn>
function database() {
  return { rpc, from(table: string) {
    const filters: [string, unknown][] = []; let operation = 'select'; let payload: Row = {}
    const query = {
      select() { return query }, eq(k: string, v: unknown) { filters.push([k,v]); return query },
      in() { return query }, insert(row: Row) { operation = 'insert'; payload = row; return query },
      update(row: Row) { operation = 'update'; payload = row; return query },
      single() { return execute(true) }, maybeSingle() { return execute(true) },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute(false)).then(resolve) },
    }
    function execute(single: boolean) {
      const rows = (tables[table] ?? []).filter(r => filters.every(([k,v]) => r[k] === v))
      if (operation === 'insert') tables[table].push({ id: 'new', ...payload })
      if (operation === 'update') rows.forEach(r => Object.assign(r,payload))
      return { data: single ? rows[0] ?? null : rows, error: null, count: rows.length }
    }
    return query
  } }
}
beforeEach(() => {
  tables = {
    projects: [{id:'p',org_id:'org'}], itrs:[{id:'i',template_id:'tpl',project_id:'p',tag_id:'t',status:'completed',progress_pct:100}],
    itr_assignments: [{role:'executor',user_id:'u',itr_id:'i'},{role:'supervisor',user_id:'s',itr_id:'i'},{role:'client',user_id:'c',itr_id:'i'}],
    itr_signatures: [], work_plan_items: [],
    itr_template_items: [{id:'q',template_id:'tpl',item_type:'text',is_required:true,is_critical:false,requires_photo:false,requires_measurement:false,condition_item_id:null,condition_value:null,options:null}],
    itr_responses: [{itr_id:'i',item_id:'q',value_text:'done',value_numeric:null,value_bool:null,value_option:null,is_passed:null}],
    itr_attachments: [],
  }
  rpcResult = { data: { status: 'completed', project_id: 'p', tag_id: 't' }, error: null }
  rpc = vi.fn(async () => rpcResult)
  state.ctx = { supabase: database(), orgId:'org',userId:'u' }
})
describe('atomic ITR actions', () => {
  it('delegates signing to the transactional RPC without direct signature writes', async () => {
    expect(await signItr('i','executor','p','t','image')).toEqual({})
    expect(rpc).toHaveBeenCalledWith('sign_itr_atomic', { p_itr_id:'i', p_role:'executor', p_signature_image:'image' })
    expect(tables.itr_signatures).toEqual([])
  })
  it('surfaces a rejected transaction', async () => {
    rpcResult = { data:null, error:{message:'Applicable content incomplete or rejected'} }
    expect((await signItr('i','executor','p','t')).error).toBeTruthy()
    expect(tables.itr_signatures).toEqual([])
  })
  it('rejects another tag route before invoking RPC', async () => { expect((await signItr('i','executor','p','wrong')).error).toBeTruthy(); expect(rpc).not.toHaveBeenCalled() })
  it('rejects another active organization before invoking RPC', async () => { state.ctx.orgId='other'; expect((await signItr('i','executor','p','t')).error).toBeTruthy(); expect(rpc).not.toHaveBeenCalled() })
  it('rejects invalid role at runtime', async () => { expect((await signItr('i','unexpected' as 'executor','p','t')).error).toBeTruthy(); expect(rpc).not.toHaveBeenCalled() })
  it('reopens using transactional audit and revocation', async () => {
    rpcResult = { data:{revoked_count:1,previous_signatures:[],project_id:'p',tag_id:'t',itr_number:'I'},error:null }
    expect(await revokeItrApproval({itrId:'i',projectId:'p',tagId:'t',reason:'Correction'})).toEqual({revokedCount:1})
    expect(rpc).toHaveBeenCalledWith('reopen_itr_atomic',{p_itr_id:'i',p_reason:'Correction'})
  })
  it('surfaces reopening rollback error', async () => {
    rpcResult = { data:null,error:{message:'Audit failure'} }
    expect((await revokeItrApproval({itrId:'i',projectId:'p',tagId:'t',reason:'Correction'})).error).toBeTruthy()
  })
})
