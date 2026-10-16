import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Gestión diaria (fase 5 del plan readiness, migración 20261017120000) contra la BD real:
 *   - numeración atómica por proyecto (ACC-0001, ACC-0002…) y borrado de borradores;
 *   - «hecha» exige evidencia salvo método «revisión»; quien cierra no puede verificar;
 *   - criterio implícito `constraints_clear`: restricción con gate → warn; nivel 4 → fail;
 *     cerrar exige acciones verificadas;
 *   - TQ: no se responde en borrador; sistema de otro proyecto rechazado.
 * Las decisiones (inmutables) y el ciclo con dos personas se probaron con rollback en la migración
 * y se prueban en la UI. Siembra área/sistema en TEST_PROJECT_A_ID; al borrar el área caen en cascada
 * las restricciones; las acciones de prueba quedan canceladas o se borran como borradores.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const pid = env.TEST_PROJECT_A_ID!
const stamp = `D${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let me = ''
let orgId = ''
const ids = { area: '', system: '', gate: '' }
const drafts: string[] = []
const toCancel: string[] = []

type GateRow = { gate_id: string; criteria: { kind: string; result: string; blocking: boolean }[] }

async function one<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function createAction(title: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await a.rpc('create_action', { p_project_id: pid, p_title: `${stamp} ${title}`, p_owner_id: me, ...extra })
  if (error) throw new Error(`create_action: ${error.message}`)
  return data as string
}

async function constraintsCriterion() {
  const { data, error } = await a.rpc('compute_system_gates', { p_system_id: ids.system })
  if (error) throw new Error(error.message)
  return (data as GateRow[]).find(g => g.gate_id === ids.gate)?.criteria.find(c => c.kind === 'constraints_clear')
}

describe.skipIf(!enabled)('gestión diaria — acciones, restricciones y TQ', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    me = data.user.id
    orgId = (await one<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    ids.gate = (await one<{ id: string }>('gate', a.from('readiness_gates').select('id').eq('org_id', orgId).eq('is_active', true).order('order_index').limit(1).single())).id
    ids.area = (await one<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    ids.system = (await one<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    for (const id of drafts) {
      const { error } = await a.rpc('delete_mgmt_item', { p_entity_kind: 'action', p_entity_id: id })
      if (error) console.error(`borrar acción ${id}: ${error.message}`)
    }
    for (const id of toCancel) await a.rpc('transition_action', { p_action_id: id, p_to: 'cancelled', p_comment: 'limpieza de test' })
    if (ids.area) await a.from('areas').delete().eq('id', ids.area)
  }, 30_000)

  it('numera de forma consecutiva y borra borradores', async () => {
    const x = await createAction('uno')
    const y = await createAction('dos')
    drafts.push(x, y)
    const { data } = await a.from('actions').select('id, seq, number, status').in('id', [x, y]).order('seq')
    expect(data![1].seq).toBe(data![0].seq + 1)
    expect(data![0].number).toMatch(/^ACC-\d{4}$/)
    expect(data!.every(r => r.status === 'open')).toBe(true)
  })

  it('«hecha» exige evidencia (método documento) y quien cierra no verifica', async () => {
    const doc = await createAction('documento', { p_verification_method: 'document' })
    drafts.push(doc)
    const noEvidence = await a.rpc('transition_action', { p_action_id: doc, p_to: 'done', p_comment: 'listo' })
    expect(noEvidence.error?.message).toMatch(/evidencia/i)

    const rev = await createAction('revisión', { p_verification_method: 'review' })
    toCancel.push(rev)
    const done = await a.rpc('transition_action', { p_action_id: rev, p_to: 'done', p_comment: 'revisado' })
    expect(done.error).toBeNull()
    const self = await a.rpc('transition_action', { p_action_id: rev, p_to: 'verified' })
    expect(self.error?.message).toMatch(/persona distinta/i)
  })

  it('una restricción con gate deja el gate con condiciones y en nivel 4 lo bloquea', async () => {
    const { data: c, error } = await a.rpc('create_constraint', {
      p_project_id: pid, p_title: `${stamp} sin aire`, p_description: 'compresor sin energía', p_system_id: ids.system,
      p_owner_id: me, p_need_date: '2026-01-01', p_impact_kind: 'schedule', p_gate_id: ids.gate, p_level: 2,
    })
    expect(error).toBeNull()
    expect((await constraintsCriterion())?.result).toBe('warn')

    const esc = await a.rpc('escalate_constraint', { p_constraint_id: c, p_level: 4, p_reason: 'sin fecha del proveedor' })
    expect(esc.error).toBeNull()
    const crit = await constraintsCriterion()
    expect(crit?.result).toBe('fail')
    expect(crit?.blocking).toBe(true)

    const act = await createAction('generador', { p_source_kind: 'constraint', p_source_id: c })
    toCancel.push(act)
    expect((await a.rpc('transition_constraint', { p_constraint_id: c, p_to: 'resolved', p_comment: 'generador conectado' })).error).toBeNull()
    const close = await a.rpc('transition_constraint', { p_constraint_id: c, p_to: 'closed' })
    expect(close.error?.message).toMatch(/sin verificar/i)
  })

  it('TQ: no se responde en borrador; sistema de otro proyecto rechazado', async () => {
    const foreign = await a.rpc('create_tq', { p_project_id: pid, p_subject: `${stamp} x`, p_question: 'y', p_system_id: crypto.randomUUID() })
    expect(foreign.error?.message).toMatch(/no pertenece/i)

    const { data: tq } = await a.rpc('create_tq', { p_project_id: pid, p_subject: `${stamp} rango PT`, p_question: '¿0–16 barg?' })
    const answer = await a.rpc('answer_tq', { p_tq_id: tq, p_response: '0–16' })
    expect(answer.error?.message).toMatch(/emitido/i)
    expect((await a.rpc('delete_mgmt_item', { p_entity_kind: 'tq', p_entity_id: tq })).error).toBeNull()
  })
})
