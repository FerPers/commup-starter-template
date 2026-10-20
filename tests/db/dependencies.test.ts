import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { defaultDependencyGates } from '@/lib/systems/dependencies'

/**
 * Sistematización (fase 2 del plan readiness, migración 20261015120000) contra la BD real:
 *   - dependencias entre sistemas: coherencia derivada en BD, ciclos y autodependencia rechazados;
 *   - criterio implícito `dependencies_ready` en `compute_system_gates`, solo en el gate bloqueado;
 *   - congelamiento informativo de límites: quién congela lo fija la BD y los cambios quedan en activity_log;
 *   - límites de batería: solo claves conocidas.
 *
 * Siembra un área con tres sistemas en TEST_PROJECT_A_ID y la borra al final (las dependencias caen
 * en cascada). El usuario A debe ser owner/admin de la org para leer activity_log. Mismas variables
 * que rls-smoke.test.ts; sin ellas se omite.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const pid = env.TEST_PROJECT_A_ID!
const stamp = `D${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let userId: string
let orgId: string
let areaId = ''
const sys = { provider: '', dependent: '', other: '' }
let gates: { id: string; code: string; order_index: number; is_active: boolean }[] = []

type GateRow = { gate_id: string; gate_code: string; computed_level: string; criteria: { kind: string; result: string; detail: Record<string, unknown> }[] }

async function one<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function systemGates(systemId: string): Promise<GateRow[]> {
  const { data, error } = await a.rpc('compute_system_gates', { p_system_id: systemId })
  if (error) throw new Error(`compute_system_gates: ${error.message}`)
  return data as GateRow[]
}

describe.skipIf(!enabled)('sistematización — dependencias, criterio dependencies_ready y congelamiento', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error || !auth.user) throw new Error(`login A: ${error?.message}`)
    userId = auth.user.id

    orgId = (await one<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    gates = await one('gates', a.from('readiness_gates').select('id, code, order_index, is_active').eq('org_id', orgId).eq('is_active', true))
    if (gates.length < 2) throw new Error('la org de prueba necesita al menos 2 gates activos')

    areaId = (await one<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const rows = await one<{ id: string; code: string }[]>('systems', a.from('systems').insert(
      ['P', 'D', 'X'].map(k => ({ project_id: pid, area_id: areaId, code: `${stamp}-${k}`, name: `test ${k}` })),
    ).select('id, code'))
    const byCode = (k: string) => rows.find(r => r.code === `${stamp}-${k}`)!.id
    Object.assign(sys, { provider: byCode('P'), dependent: byCode('D'), other: byCode('X') })
  }, 30_000)

  afterAll(async () => {
    if (areaId) await a.from('areas').delete().eq('id', areaId)
  }, 30_000)

  it('utility: el gate bloqueado del dependiente queda rojo con el proveedor listado; los demás no cambian', async () => {
    const def = defaultDependencyGates('utility', gates)!
    const dep = await one<{ org_id: string; project_id: string }>('dep', a.from('system_dependencies').insert({
      // org_id falso a propósito: la BD lo deriva del sistema y no confía en el cliente.
      org_id: '00000000-0000-0000-0000-000000000000', project_id: pid,
      system_id: sys.dependent, depends_on_system_id: sys.provider, kind: 'utility',
      required_gate_id: def.requiredGateId, blocked_gate_id: def.blockedGateId,
    }).select('org_id, project_id').single())
    expect(dep).toEqual({ org_id: orgId, project_id: pid })

    const rows = await systemGates(sys.dependent)
    const blocked = rows.find(r => r.gate_id === def.blockedGateId)!
    const crit = blocked.criteria.find(c => c.kind === 'dependencies_ready')
    expect(crit).toMatchObject({ result: 'fail' })
    expect(blocked.computed_level).toBe('red')
    const deps = (crit!.detail.dependencies as { system_id: string; ok: boolean; gate_id: string }[])
    expect(deps).toEqual([expect.objectContaining({ system_id: sys.provider, ok: false, gate_id: def.requiredGateId })])

    for (const r of rows.filter(r => r.gate_id !== def.blockedGateId)) {
      expect(r.criteria.some(c => c.kind === 'dependencies_ready')).toBe(false)
    }
    // El proveedor no hereda nada por habilitar a otro.
    expect((await systemGates(sys.provider)).some(r => r.criteria.some(c => c.kind === 'dependencies_ready'))).toBe(false)
  })

  it('rechaza ciclos (directos e indirectos) y autodependencia', async () => {
    // S11 (D-35): el ciclo se mide por gate. Con el mismo gate (el primero) en todas las aristas: X.g necesita D.g.
    const g = [...gates].sort((x, y) => x.order_index - y.order_index)[0].id
    const base = { project_id: pid, kind: 'process', required_gate_id: g, blocked_gate_id: g }
    await one('X→D', a.from('system_dependencies').insert({ ...base, system_id: sys.other, depends_on_system_id: sys.dependent }).select('id').single())

    // Directo: D.g necesita X.g cierra D→X→D.
    const direct = await a.from('system_dependencies').insert({ ...base, system_id: sys.dependent, depends_on_system_id: sys.other })
    expect(direct.error?.message).toMatch(/ciclo/)
    // Indirecto: P.g necesita X.g (válido) y luego D.g necesita P.g cierra D→P→X→D.
    await one('P→X', a.from('system_dependencies').insert({ ...base, system_id: sys.provider, depends_on_system_id: sys.other }).select('id').single())
    const indirect = await a.from('system_dependencies').insert({ ...base, system_id: sys.dependent, depends_on_system_id: sys.provider })
    expect(indirect.error?.message).toMatch(/ciclo/)
    const self = await a.from('system_dependencies').insert({ ...base, system_id: sys.provider, depends_on_system_id: sys.provider })
    expect(self.error).not.toBeNull()
  })

  it('S11 (D-35): el ciclo se mide por gates — «D.tardío necesita P.temprano» y «P.tardío necesita D.temprano» conviven', async () => {
    const sorted = [...gates].sort((x, y) => x.order_index - y.order_index)
    const [early, late] = [sorted[0], sorted[sorted.length - 1]]
    const ok1 = await a.from('system_dependencies').insert({ project_id: pid, kind: 'process', system_id: sys.dependent, depends_on_system_id: sys.provider, required_gate_id: early.id, blocked_gate_id: late.id })
    expect(ok1.error).toBeNull()
    const ok2 = await a.from('system_dependencies').insert({ project_id: pid, kind: 'process', system_id: sys.provider, depends_on_system_id: sys.dependent, required_gate_id: early.id, blocked_gate_id: late.id })
    expect(ok2.error).toBeNull()
    // Pero «P.temprano necesita D.tardío» sí cierra un ciclo (D.tardío ya necesita P.temprano).
    const bad = await a.from('system_dependencies').insert({ project_id: pid, kind: 'process', system_id: sys.provider, depends_on_system_id: sys.dependent, required_gate_id: late.id, blocked_gate_id: early.id })
    expect(bad.error?.message).toMatch(/ciclo/)
    // Y el cálculo termina (cada proveedor se evalúa solo hasta su gate requerido).
    expect((await systemGates(sys.dependent)).length).toBeGreaterThan(0)
  })

  it('congelar fija quién congela y audita los cambios de alcance posteriores', async () => {
    const frozen = await one<{ boundary_frozen_by: string | null }>('freeze', a.from('systems')
      .update({ boundary_frozen_at: new Date().toISOString(), boundary_frozen_by: '00000000-0000-0000-0000-000000000000' })
      .eq('id', sys.other).select('boundary_frozen_by').single())
    expect(frozen.boundary_frozen_by).toBe(userId)

    await one('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.other, code: `${stamp}-SS`, name: 'test' }).select('id').single())
    const { data: log, error } = await a.from('activity_log').select('action, payload')
      .eq('entity_type', 'system').eq('entity_id', sys.other).order('created_at')
    expect(error).toBeNull()
    expect((log ?? []).map(l => l.action)).toEqual(['boundary_frozen', 'boundary_changed_after_freeze'])
    expect(log![1].payload).toMatchObject({ op: 'INSERT', entity: 'subsystem', entity_code: `${stamp}-SS` })
  })

  it('límites de batería: acepta claves conocidas y rechaza otras', async () => {
    const ok = await a.from('systems').update({ battery_limits: { inlet: 'brida 6" aguas arriba de V-101', notes: 'x' } }).eq('id', sys.provider)
    expect(ok.error).toBeNull()
    const bad = await a.from('systems').update({ battery_limits: { foo: 'x' } }).eq('id', sys.provider)
    expect(bad.error?.message).toMatch(/battery_limits/)
    const prio = await a.from('systems').update({ priority: 7 }).eq('id', sys.provider)
    expect(prio.error?.message).toMatch(/priority/)
  })
})
