import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateEligibility, resolveCatBLimit } from '@/lib/certificates/eligibility'

/**
 * Gate de certificados contra la BD real (Sprint T fase 2, 2026-09-04).
 *
 * Verifica, como usuario autenticado bajo RLS:
 *   - `compute_system_readiness` (SQL): gates por fase (verde/ámbar/rojo), límite de Cat B y blockers.
 *   - El numerador atómico de punches (trigger `punch_number_before_insert`) con inserciones en paralelo.
 *   - Que la elegibilidad TypeScript (`evaluateEligibility`) coincide con el SQL sobre los mismos datos.
 *
 * Siembra una jerarquía temporal (área/sistema/subsistema/tag) en TEST_PROJECT_A_ID y la borra al final.
 * El usuario A debe tener rol editor (owner/admin/architect/leader) en la org del proyecto.
 * Usa las mismas variables que rls-smoke.test.ts; sin ellas se omite. Los inserts disparan
 * `emit_domain_event` (domain_events reales en el proyecto de prueba): usar un proyecto de QA, nunca uno de cliente.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

type Readiness = {
  itr_total: number
  itr_approved: number
  itr_pct: number
  open_punches_a: number
  open_punches_b: number
  open_punches_c: number
  cat_b_limit: number | null
  gates: { phase_id: string; level: 'green' | 'yellow' | 'red'; ready: boolean }[]
  blockers: { code: string }[]
}

const pid = env.TEST_PROJECT_A_ID!
const stamp = `T${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let userId: string
let ids = { area: '', system: '', subsystem: '', tag: '', phase: '', discipline: '', template: '' }
let catBLimit: number | null = 3

async function readiness(): Promise<Readiness> {
  const { data, error } = await a.rpc('compute_system_readiness', { p_system_id: ids.system })
  if (error) throw new Error(`compute_system_readiness: ${error.message}`)
  const row = (data as Readiness[])[0]
  if (!row) throw new Error('compute_system_readiness sin filas')
  return row
}

/** Gate SQL de la fase de prueba (la primera de la org). */
function gate(r: Readiness) {
  const g = r.gates.find(x => x.phase_id === ids.phase)
  if (!g) throw new Error('gate de la fase de prueba ausente')
  return g
}

async function tsEligibility() {
  const [{ data: itrs }, { data: punches }] = await Promise.all([
    a.from('itrs').select('status').eq('subsystem_id', ids.subsystem).eq('phase_id', ids.phase),
    a.from('punches').select('id, punch_number, description, category, status').eq('subsystem_id', ids.subsystem),
  ])
  return evaluateEligibility(itrs ?? [], punches ?? [], catBLimit)
}

async function insertOrThrow<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

describe.skipIf(!enabled)('certificate gate — compute_system_readiness + numerador de punches', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error || !auth.user) throw new Error(`login A: ${error?.message}`)
    userId = auth.user.id

    const project = await insertOrThrow<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())
    const org = await insertOrThrow<{ settings: unknown }>('org', a.from('organizations').select('settings').eq('id', project.org_id).single())
    catBLimit = resolveCatBLimit(org.settings)
    const [phase, discipline, template] = await Promise.all([
      insertOrThrow<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', project.org_id).order('order_index').limit(1).single()),
      insertOrThrow<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', project.org_id).limit(1).single()),
      insertOrThrow<{ id: string }>('template', a.from('itr_templates').select('id').eq('org_id', project.org_id).eq('is_active', true).limit(1).single()),
    ])
    ids = { ...ids, phase: phase.id, discipline: discipline.id, template: template.id }

    const area = await insertOrThrow<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())
    const system = await insertOrThrow<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: area.id, code: `${stamp}-S`, name: 'test' }).select('id').single())
    const subsystem = await insertOrThrow<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: system.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())
    const tag = await insertOrThrow<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: subsystem.id, discipline_id: ids.discipline, tag_number: `${stamp}-TAG`, description: 'test' }).select('id').single())
    ids = { ...ids, area: area.id, system: system.id, subsystem: subsystem.id, tag: tag.id }
  }, 30_000)

  afterAll(async () => {
    if (!ids.subsystem) return
    // punches no tienen ON DELETE CASCADE desde subsystems; el área sí arrastra sistemas/subsistemas/tags/ITRs.
    await a.from('punches').delete().eq('subsystem_id', ids.subsystem)
    await a.from('areas').delete().eq('id', ids.area)
  }, 30_000)

  it('sin ITRs: gate rojo y blocker no_itrs; TS también rojo', async () => {
    const r = await readiness()
    expect(r.itr_total).toBe(0)
    expect(r.cat_b_limit).toBe(catBLimit)
    expect(gate(r)).toMatchObject({ level: 'red', ready: false })
    expect(r.blockers.map(b => b.code)).toEqual(['no_itrs'])
    expect((await tsEligibility()).eligible).toBe('red')
  })

  it('ITR pendiente: rojo con itrs_incomplete y porcentaje', async () => {
    const itr = (n: number, status: string) => ({
      project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase,
      itr_number: `${stamp}-ITR-${n}`, status,
    })
    await insertOrThrow('itrs', a.from('itrs').insert([itr(1, 'not_started'), itr(2, 'approved')]).select('id'))
    const r = await readiness()
    expect(r).toMatchObject({ itr_total: 2, itr_approved: 1 })
    expect(Number(r.itr_pct)).toBe(50)
    expect(gate(r).level).toBe('red')
    expect(r.blockers.map(b => b.code)).toEqual(['itrs_incomplete'])
    expect(await tsEligibility()).toMatchObject({ eligible: 'red', totalItrs: 2, approvedItrs: 1 })
  })

  it('numerador: inserciones paralelas reciben números P-#### únicos', async () => {
    await a.from('itrs').update({ status: 'approved' }).eq('subsystem_id', ids.subsystem)
    const base = { project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, discipline_id: ids.discipline, raised_by: userId, punch_number: '' }
    const rows = await Promise.all(
      (['A', 'B', 'C', 'C', 'C'] as const).map((category, i) =>
        insertOrThrow<{ id: string; punch_number: string }>(`punch ${i}`, a.from('punches').insert({ ...base, category, description: `${stamp} cat ${category} #${i}` }).select('id, punch_number').single()),
      ),
    )
    const numbers = rows.map(r => r.punch_number)
    expect(numbers.every(n => /^P-\d{4,}$/.test(n))).toBe(true)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('Cat A abierto: rojo; Cat C no aparece como blocker; TS coincide', async () => {
    const r = await readiness()
    expect(r).toMatchObject({ open_punches_a: 1, open_punches_b: 1, open_punches_c: 3 })
    expect(gate(r).level).toBe('red')
    expect(r.blockers.map(b => b.code)).toEqual(['punches_a_open', 'punches_b_open'])
    expect((await tsEligibility()).eligible).toBe('red')
  })

  it('Cat A cerrado, 1 Cat B abierto: ámbar (listo con condiciones); TS amarillo', async () => {
    await a.from('punches').update({ status: 'closed' }).eq('subsystem_id', ids.subsystem).eq('category', 'A')
    const r = await readiness()
    expect(gate(r)).toMatchObject({ level: 'yellow', ready: true })
    const el = await tsEligibility()
    expect(el.eligible).toBe('yellow')
    expect(el.openCatBPunches).toHaveLength(1)
  })

  it('Cat B sobre el límite: rojo con punches_b_over_limit; TS rojo', async () => {
    if (catBLimit === null) return // org sin límite: no aplica
    const extra = catBLimit // ya hay 1 Cat B abierto → total = límite + 1
    const base = { project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, discipline_id: ids.discipline, raised_by: userId, punch_number: '', category: 'B' }
    for (let i = 0; i < extra; i++) {
      await insertOrThrow(`punch B extra ${i}`, a.from('punches').insert({ ...base, description: `${stamp} cat B extra #${i}` }).select('id').single())
    }
    const r = await readiness()
    expect(gate(r)).toMatchObject({ level: 'red', ready: false })
    expect(r.blockers.map(b => b.code)).toContain('punches_b_over_limit')
    expect(await tsEligibility()).toMatchObject({ eligible: 'red', catBOverLimit: true })
  })

  it('Cat B cancelados y Cat C abiertos: verde (Cat C no bloquea); TS verde', async () => {
    await a.from('punches').update({ status: 'cancelled' }).eq('subsystem_id', ids.subsystem).eq('category', 'B')
    await a.from('punches').update({ status: 'in_progress' }).eq('subsystem_id', ids.subsystem).eq('category', 'C')
    const r = await readiness()
    expect(r).toMatchObject({ open_punches_b: 0, open_punches_c: 3 })
    expect(gate(r)).toMatchObject({ level: 'green', ready: true })
    expect(r.blockers).toEqual([])
    expect((await tsEligibility()).eligible).toBe('green')
  })
})
