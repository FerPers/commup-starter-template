import { beforeEach, describe, expect, it, vi } from 'vitest'
// A03: el alta de ITR va por una sola RPC (create_itr) y una solicitud repetida no notifica de nuevo.
const h = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, rpc: [] as Array<{ name: string; args: Record<string, unknown> }>, notified: 0, result: { data: null as unknown, error: null as { message: string } | null } }))
vi.mock('@/lib/auth/withAuth', () => ({ withAuth: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(h.ctx, ...args), withAuthOnly: (_: unknown, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(h.ctx, ...args) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notifications/itr-assignment', () => ({ notifyItrAssignmentChanged: async () => { h.notified++ } }))
import { createItrAssignment } from './itr-instances'

const rows: Record<string, Record<string, unknown>> = {
  tags: { tag_number: 'PT-101', subsystem_id: 'ss' },
  itr_templates: { code: 'I10A', phase_id: 'ph', is_active: true, required_signatures: ['executor', 'supervisor'], project_phases: { itr_client_signature: false } },
  org_members: { role: 'inspector' },
}
function db() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => { h.rpc.push({ name, args }); return h.result },
    from(table: string) {
      const q = { select: () => q, eq: () => q, single: async () => ({ data: rows[table], error: null }), maybeSingle: async () => ({ data: rows[table], error: null }) }
      return q
    },
  }
}
const input = { projectId: 'p', tagId: 't', templateId: 'tpl', subsystemId: 'ss', inspectorId: 'u1', supervisorId: 'u2', requestId: '7d1e5c2a-0f3b-4c55-9a51-3f0f2f1b6c10' }

beforeEach(() => { h.ctx = { supabase: db(), orgId: 'org', userId: 'me' }; h.rpc = []; h.notified = 0 })

describe('createItrAssignment (A03)', () => {
  it('crea ITR y firmantes en una sola llamada, con el id de la solicitud', async () => {
    h.result = { data: { id: input.requestId, itr_number: 'I10A/PT-101', created: true }, error: null }
    expect(await createItrAssignment(input)).toEqual({ itrId: input.requestId, itrNumber: 'I10A/PT-101' })
    expect(h.rpc).toHaveLength(1)
    expect(h.rpc[0]).toMatchObject({ name: 'create_itr', args: { p_id: input.requestId, p_itr_number: 'I10A/PT-101', p_assignments: { executor: 'u1', supervisor: 'u2' } } })
    expect(h.notified).toBe(1)
  })
  it('una solicitud repetida devuelve el mismo ITR y no notifica otra vez', async () => {
    h.result = { data: { id: input.requestId, itr_number: 'I10A/PT-101', created: false }, error: null }
    expect(await createItrAssignment(input)).toEqual({ itrId: input.requestId, itrNumber: 'I10A/PT-101' })
    expect(h.notified).toBe(0)
  })
  it('un rechazo de la BD sale traducido y sin ITR', async () => {
    h.result = { data: null, error: { message: 'Assigned user is not a project organization member (inactive or expired)' } }
    const res = await createItrAssignment(input)
    expect(res.itrId).toBeUndefined()
    expect(res.error).toMatch(/no es miembro/)
  })
  it('rechaza un id de solicitud que no es UUID', async () => {
    expect((await createItrAssignment({ ...input, requestId: 'x' })).error).toBeTruthy()
    expect(h.rpc).toHaveLength(0)
  })
})
