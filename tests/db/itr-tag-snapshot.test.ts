import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A44 parte (migración 20261224120000) contra la BD real: la primera firma congela los datos del tag en el ITR.
 *   - un ITR nace sin foto (lo que mande el cliente se ignora) y el cliente no la puede escribir;
 *   - sign_itr_atomic la toma en la primera firma; editar el tag después no la cambia.
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía y plantilla; el dueño de la org A es el ejecutor. Al final reabre
 * el ITR (un ITR firmado no se borra) y borra todo.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `TS${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let svc: SupabaseClient
let userId = ''
const ids = { area: '', sub: '', tag: '', template: '', item: '', itr: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

const snapshotOf = () => must<{ tag_snapshot: Record<string, unknown> | null; tag_snapshot_at: string | null }>('itr',
  a.from('itrs').select('tag_snapshot, tag_snapshot_at').eq('id', ids.itr).single())

describe('datos del tag congelados al firmar (A44)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    userId = auth.user!.id
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
      manufacturer: 'Rosemount', serial_number: 'SN-ANTES', range_min: 0, range_max: 25, eng_unit: 'bar',
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
      p_itr_number: `${stamp}-ITR`, p_assignments: { executor: userId, supervisor: LEADER },
    })
    if (created.error) throw new Error(`create_itr: ${created.error.message}`)
    ids.itr = (created.data as { id: string }).id
  }, 30_000)

  afterAll(async () => {
    // Un ITR firmado no se borra: primero la reapertura auditada (el dueño de la org es privilegiado).
    if (ids.itr) {
      await a.rpc('reopen_itr_atomic', { p_itr_id: ids.itr, p_reason: 'limpieza de la prueba A44' })
      await a.from('itrs').delete().eq('id', ids.itr)
    }
    if (ids.area) await svc.from('areas').delete().eq('id', ids.area)
    if (ids.template) await svc.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('un ITR nace sin foto y el cliente no la puede escribir', async () => {
    expect(await snapshotOf()).toEqual({ tag_snapshot: null, tag_snapshot_at: null })
    const { error } = await a.from('itrs').update({ tag_snapshot: { serial_number: 'FALSO' } }).eq('id', ids.itr)
    expect(error?.message).toMatch(/written only by signing/)
  })

  it('la primera firma congela los datos del tag; editar el tag después no los cambia', async () => {
    // (la reapertura del final borra las firmas; la siguiente primera firma tomaría una foto nueva)
    await must('response', a.from('itr_responses').insert({ itr_id: ids.itr, item_id: ids.item, value_bool: true }).select('id'))
    const { error } = await a.rpc('sign_itr_atomic', { p_itr_id: ids.itr, p_role: 'executor' })
    expect(error).toBeNull()
    const signed = await snapshotOf()
    expect(signed.tag_snapshot).toMatchObject({ tag_number: `${stamp}-PT`, manufacturer: 'Rosemount', serial_number: 'SN-ANTES', range_max: 25, eng_unit: 'bar' })
    expect(signed.tag_snapshot_at).not.toBeNull()

    await must('tag edit', a.from('tags').update({ serial_number: 'SN-DESPUES', range_max: 40 }).eq('id', ids.tag).select('id'))
    expect((await snapshotOf()).tag_snapshot).toMatchObject({ serial_number: 'SN-ANTES', range_max: 25 })
  })
})
