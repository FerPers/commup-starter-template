import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Planificación por readiness (fase 5 sesión 2, migración 20261017150000) contra la BD real:
 *   - pesos de gate normalizados (NULL = 1) y fórmula del avance ponderado;
 *   - forecast libre; compromiso: el primero sin motivo, cambiarlo exige motivo; historial;
 *   - take_mgmt_snapshot no es ejecutable por usuarios (solo service_role).
 * Siembra área/sistema en TEST_PROJECT_A_ID (las fechas caen en cascada al borrar el área) y restaura
 * los pesos originales de la org de prueba.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const pid = env.TEST_PROJECT_A_ID!
const stamp = `P${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let orgId = ''
let systemId = ''
let areaId = ''
let gates: { id: string; weight: number | null }[] = []

type Progress = { gate_id: string; weight: number; itr_total: number; pct: number }

async function one<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

describe.skipIf(!enabled)('planificación por readiness — pesos, forecast/compromiso y snapshot', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    orgId = (await one<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    gates = await one('gates', a.from('readiness_gates').select('id, weight').eq('org_id', orgId).eq('is_active', true).not('phase_id', 'is', null).order('order_index'))
    areaId = (await one<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    systemId = (await one<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: areaId, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    if (gates.length) await a.rpc('set_gate_weights', { p_org_id: orgId, p_weights: gates.map(g => ({ gate_id: g.id, weight: g.weight })) })
    if (areaId) await a.from('areas').delete().eq('id', areaId)
  }, 30_000)

  it('normaliza pesos y un gate sin ITR cuenta 0', async () => {
    expect(gates.length).toBeGreaterThan(1)
    const w = gates.map((g, i) => ({ gate_id: g.id, weight: i === 0 ? 3 : 1 }))
    expect((await a.rpc('set_gate_weights', { p_org_id: orgId, p_weights: w })).error).toBeNull()
    const rows = await one<Progress[]>('progress', a.rpc('compute_system_progress', { p_system_id: systemId }))
    const total = 3 + (gates.length - 1)
    expect(Number(rows[0].weight)).toBeCloseTo(3 / total, 4)
    expect(rows.reduce((s, r) => s + Number(r.weight), 0)).toBeCloseTo(1, 4)
    expect(rows.every(r => r.itr_total === 0 && Number(r.pct) === 0)).toBe(true)

    const bad = await a.rpc('set_gate_weights', { p_org_id: orgId, p_weights: [{ gate_id: gates[0].id, weight: -1 }] })
    expect(bad.error?.message).toMatch(/fuera de rango/i)
  })

  it('compromiso: el primero sin motivo; cambiarlo exige motivo; queda historial', async () => {
    const g = gates[0].id
    expect((await a.rpc('set_gate_forecast', { p_system_id: systemId, p_gate_id: g, p_date: '2027-01-10' })).error).toBeNull()
    expect((await a.rpc('set_gate_commitment', { p_system_id: systemId, p_gate_id: g, p_date: '2027-01-15' })).error).toBeNull()
    const noReason = await a.rpc('set_gate_commitment', { p_system_id: systemId, p_gate_id: g, p_date: '2027-01-20' })
    expect(noReason.error?.message).toMatch(/motivo/i)
    expect((await a.rpc('set_gate_commitment', { p_system_id: systemId, p_gate_id: g, p_date: '2027-01-20', p_reason: 'retraso de vendor' })).error).toBeNull()

    const plan = await one<{ forecast_date: string; commitment_date: string }>('plan',
      a.from('system_gate_plans').select('forecast_date, commitment_date').eq('system_id', systemId).eq('gate_id', g).single())
    expect(plan).toEqual({ forecast_date: '2027-01-10', commitment_date: '2027-01-20' })
    const { data: events } = await a.from('system_gate_plan_events').select('kind').eq('system_id', systemId).eq('gate_id', g)
    expect(events?.map(e => e.kind)).toEqual(['forecast', 'commitment', 'commitment'])
  })

  it('el snapshot es solo de service_role', async () => {
    const res = await a.rpc('take_mgmt_snapshot', { p_project_id: pid })
    expect(res.error).not.toBeNull()
  })
})
