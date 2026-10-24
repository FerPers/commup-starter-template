import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateItrCompletion, type CompletionItem, type CompletionResponse } from '@/lib/itr/completion'
import { continuityScopeFromRow, type ContinuityScope } from '@/lib/itr/continuity'
import { requireDbEnv } from './env'

/**
 * A38 (2026-10-24): el alcance de la continuidad lo fija un líder que no es el ejecutor y queda congelado en el ITR.
 *   - set_itr_continuity_scope: rol (líder+), no el ejecutor, motivo para cambiarlo, sin cambios = sin escritura,
 *     auditoría en activity_log; itr_continuity_scopes no se escribe por REST.
 *   - evaluate_itr_capture (la de la firma) = evaluateItrCompletion con el alcance: sin alcance, captura que no lo cubre,
 *     pantallas en otro orden, rechazo y lectura obligatoria por plantilla.
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía; al final borra todo.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_ROLE_LEADER_EMAIL', 'TEST_ROLE_LEADER_PASSWORD', 'TEST_ROLE_INSPECTOR_EMAIL', 'TEST_ROLE_INSPECTOR_PASSWORD'])

const INSPECTOR = 'e2e00000-0000-4000-8000-0000000000a1'
const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `CS${Date.now().toString(36).toUpperCase()}`
let owner: SupabaseClient, leader: SupabaseClient, inspector: SupabaseClient
let ownerId = ''
const ids = { org: '', area: '', sub: '', tag: '', template: '', cont: '', contReading: '', text: '' }
const itr = { main: '', leaderExec: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}
async function signIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { client: c, id: data.user!.id }
}
async function createItr(executor: string, supervisor: string, n: string) {
  const created = await owner.rpc('create_itr', {
    p_id: crypto.randomUUID(), p_project_id: pid, p_tag_id: ids.tag, p_subsystem_id: ids.sub, p_template_id: ids.template,
    p_itr_number: `${stamp}-${n}`, p_assignments: { executor, supervisor },
  })
  if (created.error) throw new Error(`create_itr: ${created.error.message}`)
  return (created.data as { id: string }).id
}
const setScope = (c: SupabaseClient, itrId: string, itemId: string, grouping: string, count: number, shields: string[], reason?: string) =>
  c.rpc('set_itr_continuity_scope', { p_itr_id: itrId, p_item_id: itemId, p_grouping: grouping, p_count: count, p_shields: shields, ...(reason ? { p_reason: reason } : {}) })

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, from: `TB1-${id}`, to: `TB2-${id}`, result: 'pass', remarks: '', reading: null, unit: '', ...extra })
const capture = (grouping: string, count: number, shields: string[], rows: unknown[]) => JSON.stringify({ version: 1, grouping, count, shields, measurementRequired: false, rows })

async function compare(itrId: string, answers: Record<string, string>) {
  await must('clear', owner.from('itr_responses').delete().eq('itr_id', itrId).select('id'))
  const rows = Object.entries(answers).map(([item_id, value_text]) => ({ itr_id: itrId, item_id, value_text }))
  if (rows.length) await must('responses', owner.from('itr_responses').insert(rows).select('id'))
  const [{ data: items }, { data: responses }, { data: scopes }, { data: sql, error }] = await Promise.all([
    owner.from('itr_template_items').select('id, item_type, is_required, is_critical, requires_photo, requires_measurement, requires_document, condition_item_id, condition_value, options, option_outcomes, acceptance_min, acceptance_max').eq('template_id', ids.template),
    owner.from('itr_responses').select('item_id, value_text, value_numeric, value_bool, value_option, remarks, is_passed').eq('itr_id', itrId),
    owner.from('itr_continuity_scopes').select('item_id, grouping_mode, quantity, shields').eq('itr_id', itrId),
    owner.rpc('evaluate_itr_capture', { p_itr_id: itrId }),
  ])
  if (error) throw new Error(error.message)
  const byItem: Record<string, ContinuityScope> = {}
  for (const s of scopes ?? []) { const scope = continuityScopeFromRow(s); if (scope) byItem[s.item_id] = scope }
  const ts = evaluateItrCompletion((items ?? []) as CompletionItem[], (responses ?? []) as CompletionResponse[], [], null, byItem)
  const q = sql as Record<string, unknown>
  const sorted = (v: unknown) => [...(v as string[])].sort()
  return {
    ts: { complete: ts.isComplete, fail: ts.hasCriticalFail, missing: sorted(ts.missingRequiredItemIds) },
    sql: { complete: q.is_complete, fail: q.has_critical_fail, missing: sorted(q.missing_required_item_ids) },
  }
}

describe('alcance de la continuidad (A38)', () => {
  beforeAll(async () => {
    const a = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    owner = a.client; ownerId = a.id
    leader = (await signIn(env.TEST_ROLE_LEADER_EMAIL!, env.TEST_ROLE_LEADER_PASSWORD!)).client
    inspector = (await signIn(env.TEST_ROLE_INSPECTOR_EMAIL!, env.TEST_ROLE_INSPECTOR_PASSWORD!)).client
    ids.org = (await must<{ org_id: string }>('project', owner.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', owner.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', owner.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.area = (await must<{ id: string }>('area', owner.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', owner.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', owner.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', owner.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-CBL`, description: 'cable' }).select('id').single())).id
    ids.template = (await must<{ id: string }>('template', owner.from('itr_templates').insert({
      org_id: ids.org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-T`, title: 'continuidad', is_active: true, required_signatures: ['executor', 'supervisor'],
    }).select('id').single())).id
    const sec = await must<{ id: string }>('section', owner.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    const item = async (description: string, item_type: string, order_index: number, options: unknown = null) =>
      (await must<{ id: string }>(`item ${description}`, owner.from('itr_template_items').insert({ template_id: ids.template, section_id: sec.id, description, item_type, is_required: true, options, order_index }).select('id').single())).id
    ids.cont = await item('continuidad', 'continuity', 0)
    ids.contReading = await item('continuidad con lectura', 'continuity', 1, { measurement_required: true })
    ids.text = await item('observación', 'text', 2)
    itr.main = await createItr(INSPECTOR, LEADER, '1')
    itr.leaderExec = await createItr(LEADER, ownerId, '2')
  }, 60_000)

  afterAll(async () => {
    if (ids.area) await owner.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tag/ITR/alcances
    if (ids.template) await owner.from('itr_templates').delete().eq('id', ids.template)
  })

  it('el inspector (ejecutor) no fija el alcance', async () => {
    const { error } = await setScope(inspector, itr.main, ids.cont, 'pairs', 2, ['S1'])
    expect(error?.code).toBe('42501')
  })

  it('un líder que es el ejecutor de ese ITR tampoco', async () => {
    const { error } = await setScope(leader, itr.leaderExec, ids.cont, 'pairs', 2, [])
    expect(error?.message).toContain('executor_cannot_scope')
  })

  it('nadie escribe el alcance por REST', async () => {
    const { error } = await leader.from('itr_continuity_scopes').insert({ itr_id: itr.main, item_id: ids.cont, project_id: pid, grouping_mode: 'pairs', quantity: 1, set_by: LEADER })
    expect(error?.code).toBe('42501')
  })

  it('valida el ítem y el alcance', async () => {
    expect((await setScope(leader, itr.main, ids.text, 'pairs', 2, [])).error?.message).toContain('invalid_item')
    expect((await setScope(leader, itr.main, ids.cont, 'pairs', 0, [])).error?.message).toContain('invalid_scope')
    expect((await setScope(leader, itr.main, ids.cont, 'pairs', 2, ['S1', ' S1 '])).error?.message).toContain('invalid_scope')
  })

  it('el líder lo fija; cambiarlo exige motivo; repetirlo no escribe; queda auditado', async () => {
    const first = await setScope(leader, itr.main, ids.cont, 'pairs', 2, ['S1', 'S2'])
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ changed: true })
    expect((await setScope(leader, itr.main, ids.cont, 'pairs', 2, ['S2', 'S1'])).data).toMatchObject({ changed: false })
    expect((await setScope(leader, itr.main, ids.cont, 'pairs', 1, ['S1'])).error?.message).toContain('reason_required')
    const changed = await setScope(leader, itr.main, ids.cont, 'pairs', 2, ['S1'], 'Plano de cables rev. B: una sola pantalla')
    expect(changed.error).toBeNull()
    const { data: stored } = await owner.from('itr_continuity_scopes').select('grouping_mode, quantity, shields, reason').eq('itr_id', itr.main).eq('item_id', ids.cont).single()
    expect(stored).toEqual({ grouping_mode: 'pairs', quantity: 2, shields: ['S1'], reason: 'Plano de cables rev. B: una sola pantalla' })
    const { data: log } = await owner.from('activity_log').select('action, payload').eq('entity_id', itr.main).in('action', ['continuity_scope_set', 'continuity_scope_changed']).order('created_at')
    expect((log ?? []).map(l => l.action)).toEqual(['continuity_scope_set', 'continuity_scope_changed'])
    expect((log ?? [])[1].payload).toMatchObject({ count: 2, shields: ['S1'], previous: { count: 2, shields: ['S1', 'S2'] } })
  })

  describe('evaluate_itr_capture = evaluateItrCompletion con el alcance', () => {
    const pairs2 = (extra: Record<string, Record<string, unknown>> = {}) =>
      ['P1-A', 'P1-B', 'P2-A', 'P2-B', 'S:S1'].map(id => row(id, extra[id] ?? {}))
    const reading = (list: string[]) => list.map(id => row(id, { reading: 0.4, unit: 'ohm' }))
    const scenarios: Array<[string, () => Promise<void>, () => Record<string, string>, Partial<{ complete: boolean; fail: boolean }>]> = [
      ['la segunda continuidad sin alcance', async () => {}, () => ({ [ids.cont]: capture('pairs', 2, ['S1'], pairs2()), [ids.contReading]: capture('conductors', 1, [], reading(['C1'])), [ids.text]: 'ok' }), { complete: false }],
      ['todo cubierto', async () => { await setScope(leader, itr.main, ids.contReading, 'conductors', 1, []) }, () => ({ [ids.cont]: capture('pairs', 2, ['S1'], pairs2()), [ids.contReading]: capture('conductors', 1, [], reading(['C1'])), [ids.text]: 'ok' }), { complete: true, fail: false }],
      ['un par capturado cuando el alcance dice dos', async () => {}, () => ({ [ids.cont]: capture('pairs', 1, ['S1'], ['P1-A', 'P1-B', 'S:S1'].map(id => row(id))), [ids.contReading]: capture('conductors', 1, [], reading(['C1'])), [ids.text]: 'ok' }), { complete: false }],
      ['un conductor rechazado', async () => {}, () => ({ [ids.cont]: capture('pairs', 2, ['S1'], pairs2({ 'P2-B': { result: 'fail' } })), [ids.contReading]: capture('conductors', 1, [], reading(['C1'])), [ids.text]: 'ok' }), { complete: true, fail: true }],
      ['la plantilla exige lectura y falta', async () => {}, () => ({ [ids.cont]: capture('pairs', 2, ['S1'], pairs2()), [ids.contReading]: capture('conductors', 1, [], [row('C1')]), [ids.text]: 'ok' }), { complete: false }],
      ['la captura dice «lectura opcional» pero la plantilla manda', async () => {}, () => ({ [ids.cont]: capture('pairs', 2, ['S1'], pairs2()), [ids.contReading]: JSON.stringify({ version: 1, grouping: 'conductors', count: 1, shields: [], measurementRequired: false, rows: [row('C1')] }), [ids.text]: 'ok' }), { complete: false }],
    ]
    for (const [name, before, answers, expected] of scenarios) {
      it(name, async () => {
        await before()
        const r = await compare(itr.main, answers())
        expect(r.sql, name).toEqual(r.ts)
        expect(r.ts).toMatchObject(expected)
      })
    }
  })
})
