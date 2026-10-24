import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A40 (migración 20261221120000) contra la BD real: clone_itr_template_from_catalog importa en UNA transacción.
 *   - un código nuevo llega activo, con firmas requeridas, equipo de prueba, ítems, condiciones re-mapeadas y su fila
 *     de la matriz equipo × ITR, y su auditoría;
 *   - repetir sin pedir actualización falla; con actualización crea una revisión inactiva (sin matriz);
 *   - si la última revisión cambió desde que quien llama la comparó, falla (CU409) sin crear nada;
 *   - una disciplina que falta en el destino no deja nada a medias.
 * Org de origen propia (el dueño de la org A es miembro, así nada queda como catálogo público); se borra al final.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const ORG_A = 'e2e00000-0000-4000-8000-000000000001'
const stamp = `A40${Date.now().toString(36).toUpperCase()}`
const code = `${stamp}-T`
let a: SupabaseClient
let svc: SupabaseClient
let userId = ''
const ids = { srcOrg: '', srcTemplate: '', srcTemplateNoDisc: '', eqA: '', eqSrc: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

const importIt = (args: Record<string, unknown>) => a.rpc('clone_itr_template_from_catalog', { p_target_org_id: ORG_A, ...args })
const localRevisions = () => a.from('itr_templates').select('id, version, is_active, required_signatures, requires_test_equipment, description')
  .eq('org_id', ORG_A).eq('code', code).order('version').then(r => r.data ?? [])

describe('importación de plantillas — una transacción (A40)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    userId = auth.user!.id
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

    ids.srcOrg = (await must<{ id: string }>('org', svc.from('organizations').insert({ name: `Origen ${stamp}`, slug: stamp.toLowerCase() }).select('id').single())).id
    await must('member', svc.from('org_members').insert({ org_id: ids.srcOrg, user_id: userId, role: 'inspector', status: 'active' }).select('org_id'))
    const [disc, phase, discX] = await Promise.all([
      must<{ id: string }>('disc', svc.from('disciplines').insert({ org_id: ids.srcOrg, code: 'I', name: 'Instr', color: '#2563eb' }).select('id').single()),
      must<{ id: string }>('phase', svc.from('project_phases').insert({ org_id: ids.srcOrg, code: 'A', name: 'MC', order_index: 1 }).select('id').single()),
      must<{ id: string }>('discX', svc.from('disciplines').insert({ org_id: ids.srcOrg, code: `${stamp}X`, name: 'Sin par', color: '#2563eb' }).select('id').single()),
    ])
    ids.eqSrc = (await must<{ id: string }>('eqSrc', svc.from('equipment_types').insert({ org_id: ids.srcOrg, code: `${stamp}-EQ`, name: 'Transmisor' }).select('id').single())).id
    ids.eqA = (await must<{ id: string }>('eqA', svc.from('equipment_types').insert({ org_id: ORG_A, code: `${stamp}-EQ`, name: 'Transmisor' }).select('id').single())).id

    const tpl = await must<{ id: string }>('tpl', svc.from('itr_templates').insert({
      org_id: ids.srcOrg, discipline_id: disc.id, phase_id: phase.id, code, title: 'Plantilla A40', is_active: true,
      required_signatures: ['executor', 'supervisor', 'client'], requires_test_equipment: true,
    }).select('id').single())
    ids.srcTemplate = tpl.id
    const sec = await must<{ id: string }>('sec', svc.from('itr_template_sections').insert({ template_id: tpl.id, title: 'Inspección', order_index: 0 }).select('id').single())
    const first = await must<{ id: string }>('item1', svc.from('itr_template_items').insert({
      section_id: sec.id, template_id: tpl.id, description: '¿Aplica?', item_type: 'yes_no', is_required: true, order_index: 0,
    }).select('id').single())
    await must('item2', svc.from('itr_template_items').insert({
      section_id: sec.id, template_id: tpl.id, description: 'Detalle', item_type: 'text', is_required: true, order_index: 1,
      condition_item_id: first.id, condition_value: 'yes',
    }).select('id'))
    await must('matrix', svc.from('equipment_type_templates').insert({ org_id: ids.srcOrg, equipment_type_id: ids.eqSrc, itr_template_id: tpl.id, status: 'accepted', source: 'manual' }).select('id'))

    ids.srcTemplateNoDisc = (await must<{ id: string }>('tplX', svc.from('itr_templates').insert({
      org_id: ids.srcOrg, discipline_id: discX.id, phase_id: phase.id, code: `${stamp}-X`, title: 'Sin disciplina en destino', is_active: true,
    }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    await svc.from('equipment_type_templates').delete().eq('org_id', ORG_A).eq('equipment_type_id', ids.eqA)
    await svc.from('itr_templates').delete().eq('org_id', ORG_A).in('code', [code, `${stamp}-X`])
    if (ids.eqA) await svc.from('equipment_types').delete().eq('id', ids.eqA)
    if (ids.srcOrg) {
      await svc.from('equipment_type_templates').delete().eq('org_id', ids.srcOrg)
      await svc.from('itr_templates').delete().eq('org_id', ids.srcOrg)
      await svc.from('equipment_types').delete().eq('org_id', ids.srcOrg)
      await svc.from('disciplines').delete().eq('org_id', ids.srcOrg)
      await svc.from('project_phases').delete().eq('org_id', ids.srcOrg)
      await svc.from('org_members').delete().eq('org_id', ids.srcOrg)
      await svc.from('organizations').delete().eq('id', ids.srcOrg)
    }
  }, 30_000)

  it('un código nuevo llega activo y completo: firmas, equipo, ítems, condición, matriz y auditoría', async () => {
    const { data, error } = await importIt({ p_source_template_id: ids.srcTemplate, p_description: 'Importada (prueba)', p_content_hash: 'h1' })
    expect(error).toBeNull()
    expect(data).toMatchObject({ kind: 'created', version: 1, is_active: true, matrix_rows: 1 })
    const [rev] = await localRevisions()
    expect(rev).toMatchObject({ version: 1, is_active: true, requires_test_equipment: true, description: 'Importada (prueba)' })
    expect(rev.required_signatures).toEqual(expect.arrayContaining(['executor', 'supervisor', 'client']))
    const { data: items } = await a.from('itr_template_items').select('id, description, condition_item_id, condition_value').eq('template_id', rev.id).order('order_index')
    expect(items).toHaveLength(2)
    expect(items![1]).toMatchObject({ condition_item_id: items![0].id, condition_value: 'yes' })
    const { data: matrix } = await a.from('equipment_type_templates').select('equipment_type_id, status').eq('itr_template_id', rev.id)
    expect(matrix).toEqual([{ equipment_type_id: ids.eqA, status: 'accepted' }])
    const { data: log } = await a.from('activity_log').select('action, payload').eq('entity_id', rev.id)
    expect(log).toEqual([expect.objectContaining({ action: 'template_imported', payload: expect.objectContaining({ kind: 'created', content_hash: 'h1', matrix_rows: 1 }) })])
  })

  it('repetir sin pedir actualización falla y no crea nada', async () => {
    const { error } = await importIt({ p_source_template_id: ids.srcTemplate })
    expect(error?.message).toMatch(/already exists in the target/)
    expect(await localRevisions()).toHaveLength(1)
  })

  it('con actualización crea una revisión inactiva, sin matriz propia', async () => {
    const { data, error } = await importIt({ p_source_template_id: ids.srcTemplate, p_update_existing: true, p_expected_latest_version: 1 })
    expect(error).toBeNull()
    expect(data).toMatchObject({ kind: 'revision', version: 2, is_active: false, matrix_rows: 0 })
    const revs = await localRevisions()
    expect(revs.map(r => [r.version, r.is_active])).toEqual([[1, true], [2, false]])
  })

  it('si la última revisión cambió desde que se comparó, falla (CU409) sin duplicar', async () => {
    const { error } = await importIt({ p_source_template_id: ids.srcTemplate, p_update_existing: true, p_expected_latest_version: 1 })
    expect(error?.code).toBe('CU409')
    expect(await localRevisions()).toHaveLength(2)
  })

  it('una disciplina que falta en el destino no deja nada a medias', async () => {
    const { error } = await importIt({ p_source_template_id: ids.srcTemplateNoDisc })
    expect(error?.message).toMatch(/Missing discipline/)
    const { data } = await a.from('itr_templates').select('id').eq('org_id', ORG_A).eq('code', `${stamp}-X`)
    expect(data).toEqual([])
  })
})
