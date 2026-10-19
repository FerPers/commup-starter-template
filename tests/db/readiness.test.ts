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
 * Siembra una jerarquía temporal (área/sistema/subsistema/tag) y una plantilla mínima (1 ítem) en
 * TEST_PROJECT_A_ID y la borra al final. Desde la integridad atómica de ITR (migración 20260909180000)
 * un ITR solo llega a `approved` firmando (`sign_itr_atomic`: contenido completo + firmas requeridas). Desde S04
 * (D6) una persona no firma dos roles: la plantilla del test pide solo al ejecutor (`required_signatures`)
 * y un ITR firmado solo se borra tras `reopen_itr_atomic`, que exige owner/admin/architect:
 * el usuario A debe tener uno de esos roles en la org del proyecto.
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
let ids = { area: '', system: '', subsystem: '', tag: '', phase: '', discipline: '', template: '', item: '' }
const itrIds: string[] = []
const SIGNING_ROLES = ['executor'] as const
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

/** Aprueba un ITR por el camino real: respuesta al único ítem, A asignado como ejecutor y su firma (la plantilla solo pide esa). */
async function approveItr(itrId: string) {
  await insertOrThrow('response', a.from('itr_responses').insert({ itr_id: itrId, item_id: ids.item, value_bool: true, is_passed: true, responded_by: userId }).select('id'))
  await insertOrThrow('assignments', a.from('itr_assignments').insert(SIGNING_ROLES.map(role => ({ itr_id: itrId, user_id: userId, role }))).select('id'))
  for (const role of SIGNING_ROLES) {
    const { error } = await a.rpc('sign_itr_atomic', { p_itr_id: itrId, p_role: role })
    if (error) throw new Error(`sign_itr_atomic ${role}: ${error.message}`)
  }
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
    // Sin rol privilegiado la limpieza no puede reabrir los ITR firmados: fallar antes de sembrar nada.
    const member = await insertOrThrow<{ role: string }>('membership', a.from('org_members').select('role').eq('org_id', project.org_id).eq('user_id', userId).single())
    if (!['owner', 'admin', 'architect'].includes(member.role)) throw new Error(`el usuario A necesita owner/admin/architect (tiene ${member.role})`)
    const org = await insertOrThrow<{ settings: unknown }>('org', a.from('organizations').select('settings').eq('id', project.org_id).single())
    catBLimit = resolveCatBLimit(org.settings)
    const [phase, discipline] = await Promise.all([
      insertOrThrow<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', project.org_id).order('order_index').limit(1).single()),
      insertOrThrow<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', project.org_id).limit(1).single()),
    ])
    ids = { ...ids, phase: phase.id, discipline: discipline.id }

    // Plantilla propia e inactiva (no aparece en los selectores): la revisión debe ser de la misma fase que el ITR.
    const template = await insertOrThrow<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: project.org_id, discipline_id: ids.discipline, phase_id: ids.phase, code: `${stamp}-TPL`, title: 'test', is_active: false,
      required_signatures: ['executor'],
    }).select('id').single())
    ids.template = template.id
    const section = await insertOrThrow<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: template.id, title: 'test', order_index: 0 }).select('id').single())
    const item = await insertOrThrow<{ id: string }>('item', a.from('itr_template_items').insert({
      template_id: template.id, section_id: section.id, description: 'test', item_type: 'checkbox', is_required: true, order_index: 0,
    }).select('id').single())
    ids.item = item.id

    const area = await insertOrThrow<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())
    const system = await insertOrThrow<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: area.id, code: `${stamp}-S`, name: 'test' }).select('id').single())
    const subsystem = await insertOrThrow<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: system.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())
    const tag = await insertOrThrow<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: subsystem.id, discipline_id: ids.discipline, tag_number: `${stamp}-TAG`, description: 'test' }).select('id').single())
    ids = { ...ids, area: area.id, system: system.id, subsystem: subsystem.id, tag: tag.id }
  }, 30_000)

  afterAll(async () => {
    // Un ITR firmado no se puede borrar: primero se reabre (deja rastro en activity_log).
    for (const id of itrIds) {
      const { data } = await a.from('itrs').select('status').eq('id', id).single()
      const { count } = await a.from('itr_signatures').select('id', { count: 'exact', head: true }).eq('itr_id', id)
      if (data?.status === 'approved' || (count ?? 0) > 0) {
        const { error } = await a.rpc('reopen_itr_atomic', { p_itr_id: id, p_reason: 'limpieza test readiness' })
        if (error) console.error(`reopen ${id}: ${error.message}`)
      }
    }
    if (ids.subsystem) {
      // punches no tienen ON DELETE CASCADE desde subsystems; el área sí arrastra sistemas/subsistemas/tags/ITRs.
      await a.from('punches').delete().eq('subsystem_id', ids.subsystem)
      const { error } = await a.from('areas').delete().eq('id', ids.area)
      if (error) console.error(`borrar área ${ids.area}: ${error.message}`)
    }
    // La plantilla solo se puede borrar cuando ya no tiene ITRs.
    if (ids.template) {
      const { error } = await a.from('itr_templates').delete().eq('id', ids.template)
      if (error) console.error(`borrar plantilla ${ids.template}: ${error.message}`)
    }
  }, 60_000)

  it('sin ITRs: gate rojo y blocker no_itrs; TS también rojo', async () => {
    const r = await readiness()
    expect(r.itr_total).toBe(0)
    expect(r.cat_b_limit).toBe(catBLimit)
    expect(gate(r)).toMatchObject({ level: 'red', ready: false })
    expect(r.blockers.map(b => b.code)).toEqual(['no_itrs'])
    expect((await tsEligibility()).eligible).toBe('red')
  })

  it('ITR pendiente: rojo con itrs_incomplete y porcentaje', async () => {
    const itr = (n: number) => ({
      project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase,
      itr_number: `${stamp}-ITR-${n}`, status: 'not_started',
    })
    const rows = await insertOrThrow<{ id: string }[]>('itrs', a.from('itrs').insert([itr(1), itr(2)]).select('id'))
    itrIds.push(...rows.map(r => r.id))
    await approveItr(itrIds[1])
    const r = await readiness()
    expect(r).toMatchObject({ itr_total: 2, itr_approved: 1 })
    expect(Number(r.itr_pct)).toBe(50)
    expect(gate(r).level).toBe('red')
    expect(r.blockers.map(b => b.code)).toEqual(['itrs_incomplete'])
    expect(await tsEligibility()).toMatchObject({ eligible: 'red', totalItrs: 2, approvedItrs: 1 })
  }, 30_000)

  it('S04 (D4/D6): el ITR congela las firmas de la plantilla y nadie queda asignado a dos roles', async () => {
    // La plantilla ya tiene ITRs: cambiar sus firmas requeridas se permite (no es contenido) y solo afecta a los ITR nuevos.
    const { error: tplErr } = await a.from('itr_templates').update({ required_signatures: ['executor', 'supervisor'] }).eq('id', ids.template)
    expect(tplErr).toBeNull()
    const row = await insertOrThrow<{ id: string; required_signatures: string[] }>('itr E+S', a.from('itrs').insert({
      project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase,
      itr_number: `${stamp}-ITR-ES`, status: 'not_started', required_signatures: ['executor'],
    }).select('id, required_signatures').single())
    itrIds.push(row.id)
    expect(row.required_signatures).toEqual(['executor', 'supervisor'])
    const { data: first } = await a.from('itrs').select('required_signatures').eq('id', itrIds[0]).single()
    expect(first?.required_signatures).toEqual(['executor'])
    const { error: dup } = await a.from('itr_assignments').insert([
      { itr_id: row.id, user_id: userId, role: 'executor' }, { itr_id: row.id, user_id: userId, role: 'supervisor' },
    ])
    expect(dup?.message).toMatch(/two signing roles/)
    const { error: notRequired } = await a.from('itr_assignments').insert({ itr_id: row.id, user_id: userId, role: 'client' })
    expect(notRequired?.message).toMatch(/not required/)
    const { error: fixed } = await a.from('itrs').update({ required_signatures: ['executor'] }).eq('id', row.id)
    expect(fixed?.message).toMatch(/fixed when the ITR is created/)
    // Sin firmas se puede borrar: no debe contar en el gate de los tests siguientes.
    await a.from('itr_assignments').delete().eq('itr_id', row.id)
    const { error: delErr } = await a.from('itrs').delete().eq('id', row.id)
    expect(delErr).toBeNull()
    itrIds.pop()
    await a.from('itr_templates').update({ required_signatures: ['executor'] }).eq('id', ids.template)
  }, 30_000)

  it('numerador: inserciones paralelas reciben números P-#### únicos', async () => {
    await approveItr(itrIds[0])
    const base = { project_id: pid, subsystem_id: ids.subsystem, tag_id: ids.tag, discipline_id: ids.discipline, raised_by: userId, punch_number: '' }
    const rows = await Promise.all(
      (['A', 'B', 'C', 'C', 'C'] as const).map((category, i) =>
        insertOrThrow<{ id: string; punch_number: string }>(`punch ${i}`, a.from('punches').insert({ ...base, category, description: `${stamp} cat ${category} #${i}` }).select('id, punch_number').single()),
      ),
    )
    const numbers = rows.map(r => r.punch_number)
    expect(numbers.every(n => /^P-\d{4,}$/.test(n))).toBe(true)
    expect(new Set(numbers).size).toBe(numbers.length)
  }, 30_000)

  it('Cat A abierto: rojo; Cat C no aparece como blocker; TS coincide', async () => {
    const r = await readiness()
    expect(r).toMatchObject({ open_punches_a: 1, open_punches_b: 1, open_punches_c: 3 })
    expect(gate(r).level).toBe('red')
    expect(r.blockers.map(b => b.code)).toEqual(['punches_a_open', 'punches_b_open'])
    expect((await tsEligibility()).eligible).toBe('red')
  })

  it('Cat A cerrado, 1 Cat B abierto: ámbar (listo con condiciones); TS amarillo', async () => {
    // Cerrar exige verificación en campo por otra persona (fase 4, migración 20261016120000) y este test
    // tiene un solo usuario: para el gate, cancelled es tan terminal como closed.
    const { error: closeErr } = await a.from('punches').update({ status: 'cancelled' }).eq('subsystem_id', ids.subsystem).eq('category', 'A')
    expect(closeErr).toBeNull()
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
