import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * Equipos de prueba calibrados (fase 4 · bloque B, migración 20261016150000) contra la BD real:
 *   - la plantilla que exige equipo no deja firmar el ITR sin equipo registrado;
 *   - un equipo vencido en la fecha de uso bloquea la firma; uno vigente la permite;
 *   - la foto de calibración la copia el trigger (el cliente no puede falsearla).
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía, plantilla mínima (1 checkbox, requiere equipo) y
 * dos equipos (vigente y vencido); al final reabre el ITR firmado y borra todo. Usuario A: owner/admin/architect.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `TE${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let userId = ''
const ids = { org: '', area: '', template: '', item: '', itr: '', ok: '', expired: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

const sign = () => a.rpc('sign_itr_atomic', { p_itr_id: ids.itr, p_role: 'executor' })
const addEquipment = (equipmentId: string) => a.from('itr_test_equipment').insert({
  itr_id: ids.itr, equipment_id: equipmentId, project_id: pid,
  // Valores falsos a propósito: el trigger los reemplaza con la calibración real del equipo.
  calibrated_on: '2000-01-01', calibration_due: '2999-12-31', certificate_number: 'FALSO',
})

describe('equipos de prueba — calibración en la fecha de uso bloquea la firma del ITR', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error || !auth.user) throw new Error(`login A: ${error?.message}`)
    userId = auth.user.id

    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    const tpl = await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: ids.org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-TPL`, title: 'test', is_active: false, requires_test_equipment: true,
    }).select('id').single())
    ids.template = tpl.id
    const section = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: tpl.id, title: 'test', order_index: 0 }).select('id').single())
    ids.item = (await must<{ id: string }>('item', a.from('itr_template_items').insert({
      template_id: tpl.id, section_id: section.id, description: 'test', item_type: 'checkbox', is_required: true, order_index: 0,
    }).select('id').single())).id

    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    const sub = await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())
    const tag = await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: sub.id, discipline_id: disc.id, tag_number: `${stamp}-TAG`, description: 'test' }).select('id').single())
    ids.itr = (await must<{ id: string }>('itr', a.from('itrs').insert({
      project_id: pid, subsystem_id: sub.id, tag_id: tag.id, template_id: tpl.id, phase_id: phase.id, itr_number: `${stamp}-ITR`, status: 'not_started',
    }).select('id').single())).id
    await must('response', a.from('itr_responses').insert({ itr_id: ids.itr, item_id: ids.item, value_bool: true, is_passed: true, responded_by: userId }).select('id'))
    await must('assignment', a.from('itr_assignments').insert({ itr_id: ids.itr, user_id: userId, role: 'executor' }).select('id'))

    const today = new Date().toISOString().slice(0, 10)
    const base = { org_id: ids.org, kind: 'insulation_tester', serial_number: 'SN-TEST', certificate_number: 'CERT-TEST' }
    ids.ok = (await must<{ id: string }>('equipo vigente', a.from('test_equipment').insert({ ...base, code: `${stamp}-OK`, calibrated_on: '2020-01-01', calibration_due: '2999-12-31' }).select('id').single())).id
    ids.expired = (await must<{ id: string }>('equipo vencido', a.from('test_equipment').insert({ ...base, code: `${stamp}-EXP`, calibrated_on: '2020-01-01', calibration_due: '2021-01-01' }).select('id').single())).id
    expect(today > '2021-01-01').toBe(true)
  }, 30_000)

  afterAll(async () => {
    if (ids.itr) {
      const { count } = await a.from('itr_signatures').select('id', { count: 'exact', head: true }).eq('itr_id', ids.itr)
      if ((count ?? 0) > 0) await a.rpc('reopen_itr_atomic', { p_itr_id: ids.itr, p_reason: 'limpieza test equipos de prueba' })
    }
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra sistema/subsistema/tag/ITR/uso de equipos
    if (ids.template) await a.from('itr_templates').delete().eq('id', ids.template)
    for (const id of [ids.ok, ids.expired]) if (id) await a.from('test_equipment').delete().eq('id', id)
  }, 60_000)

  it('la plantilla exige equipo: sin registrar no se firma', async () => {
    const { error } = await sign()
    expect(error?.message).toMatch(/Registra el equipo de prueba/)
  })

  it('el trigger copia la calibración real; vencido en la fecha de uso bloquea', async () => {
    const { error } = await addEquipment(ids.expired)
    expect(error).toBeNull()
    const { data } = await a.from('itr_test_equipment').select('calibration_due, certificate_number, snapshot').eq('itr_id', ids.itr).single()
    expect(data).toMatchObject({ calibration_due: '2021-01-01', certificate_number: 'CERT-TEST' })
    expect((data!.snapshot as { code: string }).code).toBe(`${stamp}-EXP`)
    const res = await sign()
    expect(res.error?.message).toMatch(/fuera de calibración/)
  })

  it('reemplazado por uno vigente, se firma; firmado, ya no se puede cambiar', async () => {
    await a.from('itr_test_equipment').delete().eq('itr_id', ids.itr).eq('equipment_id', ids.expired)
    expect((await addEquipment(ids.ok)).error).toBeNull()
    const { error } = await sign()
    expect(error).toBeNull()
    const late = await a.from('itr_test_equipment').delete().eq('itr_id', ids.itr).eq('equipment_id', ids.ok)
    expect(late.error?.message).toMatch(/Signed ITR requires audited reopening/)
  })
})
