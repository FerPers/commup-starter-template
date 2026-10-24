import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A03 (migración 20261218120000) contra la BD real: create_itr crea el ITR y sus firmantes en una transacción.
 *   - un firmante que no es miembro activo, un rol requerido sin persona o un cliente como ejecutor dejan CERO ITR;
 *   - repetir la solicitud (mismo id) devuelve el ITR original, sin revisión nueva (Rn) ni asignaciones de más,
 *     también si llegan varias a la vez;
 *   - el id no sirve para otro tag o plantilla.
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía y plantilla; al final borra todo. Firmantes = actores de
 * supabase/seed/00_actors.sql (a1 inspector, a2 líder, a3 cliente; a7 es de la org B).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const INSPECTOR = 'e2e00000-0000-4000-8000-0000000000a1'
const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const CLIENT = 'e2e00000-0000-4000-8000-0000000000a3'
const OUTSIDER = 'e2e00000-0000-4000-8000-0000000000a7'

const pid = env.TEST_PROJECT_A_ID!
const stamp = `CA${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
const ids = { area: '', sub: '', tag: '', tag2: '', template: '', code: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

function create(id: string, assignments: Record<string, string>, tagId = ids.tag) {
  return a.rpc('create_itr', {
    p_id: id, p_project_id: pid, p_tag_id: tagId, p_subsystem_id: ids.sub, p_template_id: ids.template,
    p_itr_number: `${ids.code}/${stamp}-PT`, p_assignments: assignments,
  })
}

async function itrsOfTag(tagId = ids.tag) {
  const { data } = await a.from('itrs').select('id, itr_number, itr_assignments(role, user_id)').eq('tag_id', tagId)
  return data ?? []
}

describe('alta de ITR — todo o nada e idempotente (A03)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)

    const org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', org).limit(1).single()),
    ])
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id
    ids.tag2 = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT2`, description: 'test' }).select('id').single())).id
    ids.code = `${stamp}-IT`
    ids.template = (await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: org, discipline_id: disc.id, phase_id: phase.id, code: ids.code, title: 'test', is_active: true, required_signatures: ['executor', 'supervisor'],
    }).select('id').single())).id
    const section = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    await must('item', a.from('itr_template_items').insert({
      template_id: ids.template, section_id: section.id, description: 'check', item_type: 'checkbox', is_required: true, order_index: 0,
    }).select('id'))
  }, 30_000)

  afterAll(async () => {
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tags/ITR/asignaciones
    if (ids.template) await a.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('un firmante que no es miembro de la org deja cero ITR', async () => {
    const { error } = await create(crypto.randomUUID(), { executor: INSPECTOR, supervisor: OUTSIDER })
    expect(error?.message).toMatch(/not a project organization member/)
    expect(await itrsOfTag()).toHaveLength(0)
  })

  it('un rol requerido sin persona deja cero ITR', async () => {
    const { error } = await create(crypto.randomUUID(), { executor: INSPECTOR })
    expect(error?.message).toMatch(/Missing signer for required role supervisor/)
    expect(await itrsOfTag()).toHaveLength(0)
  })

  it('un rol que el ITR no exige deja cero ITR', async () => {
    const { error } = await create(crypto.randomUUID(), { executor: INSPECTOR, supervisor: LEADER, client: CLIENT })
    expect(error?.message).toMatch(/not required for this ITR/)
    expect(await itrsOfTag()).toHaveLength(0)
  })

  it('el cliente no puede ser el ejecutor', async () => {
    const { error } = await create(crypto.randomUUID(), { executor: CLIENT, supervisor: LEADER })
    expect(error?.message).toMatch(/client cannot be the ITR executor/)
    expect(await itrsOfTag()).toHaveLength(0)
  })

  it('repetir la solicitud devuelve el ITR original, sin revisión nueva', async () => {
    const id = crypto.randomUUID()
    const signers = { executor: INSPECTOR, supervisor: LEADER }
    const first = await create(id, signers)
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ id, created: true, itr_number: `${ids.code}/${stamp}-PT` })
    for (let i = 0; i < 5; i++) {
      const again = await create(id, signers)
      expect(again.data).toMatchObject({ id, created: false, itr_number: `${ids.code}/${stamp}-PT` })
    }
    const rows = await itrsOfTag()
    expect(rows).toHaveLength(1)
    expect(rows[0].itr_assignments).toHaveLength(2)
  })

  it('varias solicitudes iguales a la vez crean un solo ITR', async () => {
    const id = crypto.randomUUID()
    const results = await Promise.all(Array.from({ length: 5 }, () => create(id, { executor: INSPECTOR, supervisor: LEADER }, ids.tag2)))
    expect(results.every(r => r.error === null)).toBe(true)
    expect(results.filter(r => (r.data as { created: boolean }).created)).toHaveLength(1)
    const rows = await itrsOfTag(ids.tag2)
    expect(rows).toHaveLength(1)
    expect(rows[0].itr_assignments).toHaveLength(2)
  })

  it('el id de una solicitud no sirve para otro tag', async () => {
    const id = crypto.randomUUID()
    expect((await create(id, { executor: INSPECTOR, supervisor: LEADER })).error).toBeNull()
    const { error } = await create(id, { executor: INSPECTOR, supervisor: LEADER }, ids.tag2)
    expect(error?.message).toMatch(/already used for another record/)
  })
})
