import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { itrState } from '@/lib/states/itr'
import { requireDbEnv } from './env'

/**
 * A08 · E2 (migración 20261230120000) contra la BD real: un ITR devuelto queda «Devuelto», con quién y por qué.
 *   - nace sin devolución y nadie la escribe por REST;
 *   - return_itr_to_executor la registra y la lista (itr_list_v) la muestra con firmas hechas y requeridas;
 *   - la siguiente firma la limpia (la historia queda en activity_log).
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía y plantilla: el dueño de la org A ejecuta y el líder supervisa.
 * Al final reabre el ITR si quedó firmado y borra todo.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_ROLE_LEADER_EMAIL', 'TEST_ROLE_LEADER_PASSWORD', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `RT${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let leader: SupabaseClient
let svc: SupabaseClient
let userId = ''
let leaderId = ''
const ids = { area: '', sub: '', tag: '', template: '', item: '', itr: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function signIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { c, id: data.user!.id }
}

type ListRow = { status: 'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected'; returned_at: string | null; return_reason: string | null; signatures_done: number; signatures_required: number }
const listRow = () => must<ListRow>('itr_list_v',
  a.from('itr_list_v').select('status, returned_at, return_reason, signatures_done, signatures_required').eq('id', ids.itr).single())
const returnedBy = async () => (await must<{ returned_by: string | null }>('itr', a.from('itrs').select('returned_by').eq('id', ids.itr).single())).returned_by
const stateOf = (r: ListRow) => itrState({ status: r.status, returnedAt: r.returned_at, signaturesDone: r.signatures_done, signaturesRequired: r.signatures_required })

describe('ITR devuelto (A08 · E2)', () => {
  beforeAll(async () => {
    ;({ c: a, id: userId } = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!))
    ;({ c: leader, id: leaderId } = await signIn(env.TEST_ROLE_LEADER_EMAIL!, env.TEST_ROLE_LEADER_PASSWORD!))
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

    const org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', org).limit(1).single()),
    ])
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({
      project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'Transmisor',
    }).select('id').single())).id
    ids.template = (await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-T`, title: 'test', is_active: true, required_signatures: ['executor', 'supervisor'],
    }).select('id').single())).id
    const section = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    ids.item = (await must<{ id: string }>('item', a.from('itr_template_items').insert({
      template_id: ids.template, section_id: section.id, description: 'check', item_type: 'checkbox', is_required: true, order_index: 0,
    }).select('id').single())).id
    const created = await a.rpc('create_itr', {
      p_id: crypto.randomUUID(), p_project_id: pid, p_tag_id: ids.tag, p_subsystem_id: ids.sub, p_template_id: ids.template,
      p_itr_number: `${stamp}-ITR`, p_assignments: { executor: userId, supervisor: leaderId },
    })
    if (created.error) throw new Error(`create_itr: ${created.error.message}`)
    ids.itr = (created.data as { id: string }).id
  }, 30_000)

  afterAll(async () => {
    if (ids.itr) {
      await a.rpc('reopen_itr_atomic', { p_itr_id: ids.itr, p_reason: 'limpieza de la prueba A08' })
      await a.from('itrs').delete().eq('id', ids.itr)
    }
    if (ids.area) await svc.from('areas').delete().eq('id', ids.area)
    if (ids.template) await svc.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('un ITR nace sin devolución y nadie la escribe por REST', async () => {
    expect(await listRow()).toMatchObject({ returned_at: null, return_reason: null, signatures_done: 0, signatures_required: 2 })
    const { error } = await a.from('itrs').update({ returned_at: new Date().toISOString(), return_reason: 'falso motivo largo' }).eq('id', ids.itr)
    expect(error?.message).toMatch(/Devolver al ejecutor/)
  })

  it('diligenciado y firmado por el ejecutor = «por firmar 1/2»', async () => {
    await must('response', a.from('itr_responses').insert({ itr_id: ids.itr, item_id: ids.item, value_bool: true }).select('id'))
    const { error } = await a.rpc('sign_itr_atomic', { p_itr_id: ids.itr, p_role: 'executor' })
    expect(error).toBeNull()
    const row = await listRow()
    expect(row).toMatchObject({ status: 'completed', signatures_done: 1, signatures_required: 2, returned_at: null })
    expect(stateOf(row)).toMatchObject({ key: 'awaitingSignatures', tone: 'wait', params: { done: 1, required: 2 } })
  })

  it('el supervisor lo devuelve: la lista dice «Devuelto» con su motivo y quién', async () => {
    const reason = 'Falta la foto de la placa del transmisor'
    const { error } = await leader.rpc('return_itr_to_executor', { p_itr_id: ids.itr, p_reason: reason })
    expect(error).toBeNull()
    const row = await listRow()
    expect(row).toMatchObject({ status: 'completed', signatures_done: 0, return_reason: reason })
    expect(row.returned_at).not.toBeNull()
    expect(await returnedBy()).toBe(leaderId)
    expect(stateOf(row)).toMatchObject({ key: 'returned', tone: 'work', icon: 'returned' })
  })

  it('la siguiente firma del ejecutor cierra la devolución (queda en activity_log)', async () => {
    const { error } = await a.rpc('sign_itr_atomic', { p_itr_id: ids.itr, p_role: 'executor' })
    expect(error).toBeNull()
    const row = await listRow()
    expect(row).toMatchObject({ returned_at: null, return_reason: null, signatures_done: 1 })
    expect(await returnedBy()).toBeNull()
    const log = await must<{ action: string }[]>('activity_log',
      a.from('activity_log').select('action').eq('entity_type', 'itr').eq('entity_id', ids.itr).eq('action', 'returned'))
    expect(log).toHaveLength(1)
  })
})
