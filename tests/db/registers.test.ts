import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * Registros controlados (fase 3 del plan readiness, migración 20261015200000) contra la BD real:
 *   - numeración atómica por proyecto y tipo (CIE-0001, CIE-0002…);
 *   - quien propone no puede autorizar su propio registro; transiciones fuera de orden rechazadas;
 *   - criterio implícito `registers_clear`: un registro abierto vinculado por tag bloquea el gate que su
 *     tipo tenga configurado y deja de bloquear al cancelarse;
 *   - tags de otro proyecto rechazados.
 * El ciclo completo con dos personas (autorizar / verificar) se prueba en la UI con dos usuarios.
 *
 * Siembra un área/sistema/subsistema/tag en TEST_PROJECT_A_ID y lo borra al final; los registros, que
 * nunca se autorizan, se borran como borradores (`delete_register_item`).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `R${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let orgId = ''
const ids = { area: '', system: '', subsystem: '', tag: '', blindGate: '' }
const items: string[] = []

type GateRow = { gate_id: string; criteria: { kind: string; result: string; detail: { open_count?: number } }[] }

async function one<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function registersCriterion() {
  const { data, error } = await a.rpc('compute_system_gates', { p_system_id: ids.system })
  if (error) throw new Error(error.message)
  const gate = (data as GateRow[]).find(g => g.gate_id === ids.blindGate)!
  return gate.criteria.find(c => c.kind === 'registers_clear')
}

async function createBlind(title: string, tags: { tag_id: string; role?: string }[]) {
  const { data, error } = await a.rpc('create_register_item', {
    p_project_id: pid, p_kind: 'blind', p_title: `${stamp} ${title}`,
    p_data: { blind_type: 'spade', size: '6"', location: 'brida aguas abajo', purpose: 'pressure_test' },
    p_tags: tags,
  })
  if (error) throw new Error(`create_register_item: ${error.message}`)
  items.push(data as string)
  return data as string
}

describe('registros controlados — numeración, autorización por otra persona y bloqueo de gates', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)

    orgId = (await one<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    await a.rpc('ensure_register_types', { p_org_id: orgId })
    const blindType = await one<{ blocks_gate_id: string | null }>('tipo ciega', a.from('register_types').select('blocks_gate_id').eq('org_id', orgId).eq('kind', 'blind').single())
    if (!blindType.blocks_gate_id) throw new Error('el tipo «ciega» de la org de prueba no bloquea ningún gate')
    ids.blindGate = blindType.blocks_gate_id

    const discipline = await one<{ id: string }>('disciplina', a.from('disciplines').select('id').eq('org_id', orgId).limit(1).single())
    ids.area = (await one<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    ids.system = (await one<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
    ids.subsystem = (await one<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: ids.system, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await one<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.subsystem, discipline_id: discipline.id, tag_number: `${stamp}-PL`, description: 'línea test' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    // Nunca se autorizaron: se pueden borrar como borradores. Luego la jerarquía temporal.
    for (const id of items) {
      const { error } = await a.rpc('delete_register_item', { p_item_id: id })
      if (error) console.error(`borrar registro ${id}: ${error.message}`)
    }
    if (ids.area) await a.from('areas').delete().eq('id', ids.area)
  }, 30_000)

  it('numera por tipo de forma consecutiva y arranca en «propuesto»', async () => {
    const first = await createBlind('ciega 1', [{ tag_id: ids.tag }])
    const second = await createBlind('ciega 2', [])
    const { data } = await a.from('register_items').select('id, number, status, seq').in('id', [first, second])
    const byId = new Map((data ?? []).map(r => [r.id, r]))
    expect(byId.get(first)!.status).toBe('proposed')
    expect(byId.get(first)!.number).toMatch(/^CIE-\d{4}$/)
    expect(byId.get(second)!.seq).toBe(byId.get(first)!.seq + 1)
  }, 30_000)

  it('quien propone no puede autorizar; tampoco se salta estados', async () => {
    const own = await a.rpc('transition_register_item', { p_item_id: items[0], p_to: 'authorized' })
    expect(own.error?.message).toMatch(/no puede autorizar su propio registro/)
    const skip = await a.rpc('transition_register_item', { p_item_id: items[0], p_to: 'verified' })
    expect(skip.error?.message).toMatch(/Transición no permitida/)
  }, 30_000)

  it('un registro abierto vinculado por tag bloquea el gate de su tipo; cancelado deja de bloquear', async () => {
    const before = await registersCriterion()
    expect(before).toMatchObject({ result: 'fail' })
    expect(before!.detail.open_count).toBe(1) // solo la ciega 1 tiene un tag del sistema

    const noReason = await a.rpc('transition_register_item', { p_item_id: items[0], p_to: 'cancelled', p_comment: '' })
    expect(noReason.error?.message).toMatch(/motivo/)
    const { error } = await a.rpc('transition_register_item', { p_item_id: items[0], p_to: 'cancelled', p_comment: 'instalada por error' })
    expect(error).toBeNull()
    expect(await registersCriterion()).toMatchObject({ result: 'pass' })

    const { data: events } = await a.from('register_events').select('action, to_status').eq('item_id', items[0]).order('created_at')
    expect((events ?? []).map(e => `${e.action}:${e.to_status}`)).toEqual(['created:proposed', 'transition:cancelled'])
  }, 30_000)

  it('rechaza tags que no son del proyecto', async () => {
    const { error } = await a.rpc('create_register_item', {
      p_project_id: pid, p_kind: 'blind', p_title: `${stamp} tag ajeno`,
      p_tags: [{ tag_id: '00000000-0000-0000-0000-000000000000' }],
    })
    expect(error?.message).toMatch(/no pertenecen al proyecto/)
  }, 30_000)
})
