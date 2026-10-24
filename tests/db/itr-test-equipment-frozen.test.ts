import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A39 (migración 20261222120000) contra la BD real: el ITR congela al crearse si exige equipo de prueba.
 *   - el valor sale de la plantilla (lo que mande el cliente se ignora) y el cliente no lo puede cambiar;
 *   - cambiar la plantilla después no cambia el ITR ni lo que exige su firma (itr_test_equipment_blocker).
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía y plantillas; al final borra todo. El bloqueo de la firma es una
 * función interna (A-19): se consulta con la llave de servicio de la Supabase local.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `EQ${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let svc: SupabaseClient
const ids = { area: '', sub: '', tag: '', phase: '', disc: '', org: '', requiring: '', free: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function template(code: string, requires: boolean) {
  const tpl = await must<{ id: string }>('template', a.from('itr_templates').insert({
    org_id: ids.org, discipline_id: ids.disc, phase_id: ids.phase, code, title: 'test', is_active: false, requires_test_equipment: requires,
  }).select('id').single())
  const sec = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: tpl.id, title: 'test', order_index: 0 }).select('id').single())
  await must('item', a.from('itr_template_items').insert({ template_id: tpl.id, section_id: sec.id, description: 'check', item_type: 'checkbox', is_required: true, order_index: 0 }).select('id'))
  return tpl.id
}

function createItr(templateId: string, n: string, claimed: boolean) {
  return must<{ id: string; requires_test_equipment: boolean }>('itr', a.from('itrs').insert({
    project_id: pid, subsystem_id: ids.sub, tag_id: ids.tag, template_id: templateId, phase_id: ids.phase,
    itr_number: `${stamp}-${n}`, status: 'not_started', requires_test_equipment: claimed,
  }).select('id, requires_test_equipment').single())
}

describe('equipo de prueba congelado en el ITR (A39)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.phase = phase.id; ids.disc = disc.id
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: ids.disc, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id
    ids.requiring = await template(`${stamp}-R`, true)
    ids.free = await template(`${stamp}-F`, false)
  }, 30_000)

  afterAll(async () => {
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tag/ITR
    if (ids.requiring) await a.from('itr_templates').delete().in('id', [ids.requiring, ids.free])
  }, 30_000)

  it('el valor sale de la plantilla, no de lo que mande el cliente', async () => {
    expect((await createItr(ids.requiring, 'R1', false)).requires_test_equipment).toBe(true)
    expect((await createItr(ids.free, 'F1', true)).requires_test_equipment).toBe(false)
  })

  it('el cliente no lo puede cambiar después', async () => {
    const itr = await createItr(ids.requiring, 'R2', false)
    const { error } = await a.from('itrs').update({ requires_test_equipment: false }).eq('id', itr.id)
    expect(error?.message).toMatch(/fixed when the ITR is created/)
  })

  it('cambiar la plantilla no cambia el ITR ni lo que exige su firma', async () => {
    const strict = await createItr(ids.requiring, 'R3', false)
    const relaxed = await createItr(ids.free, 'F3', false)
    await must('relax', a.from('itr_templates').update({ requires_test_equipment: false }).eq('id', ids.requiring).select('id'))
    await must('tighten', a.from('itr_templates').update({ requires_test_equipment: true }).eq('id', ids.free).select('id'))

    const { data: rows } = await a.from('itrs').select('id, requires_test_equipment').in('id', [strict.id, relaxed.id])
    expect(Object.fromEntries((rows ?? []).map(r => [r.id, r.requires_test_equipment]))).toEqual({ [strict.id]: true, [relaxed.id]: false })
    expect((await svc.rpc('itr_test_equipment_blocker', { p_itr_id: strict.id })).data).toMatch(/Registra el equipo de prueba/)
    expect((await svc.rpc('itr_test_equipment_blocker', { p_itr_id: relaxed.id })).data).toBeNull()
  })
})
