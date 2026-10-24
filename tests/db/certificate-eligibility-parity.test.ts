import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateEligibility, resolveCatBLimit, type PunchLike } from '@/lib/certificates/eligibility'
import { requireDbEnv } from './env'

/**
 * A29: certificate_eligibility (la que decide al emitir) = evaluateEligibility (la matriz de certificados) sobre los
 * mismos datos. Un subsistema por caso: sin ITR, ITR sin aprobar, aprobado, Cat B dentro del límite (+ Cat C, que
 * nunca bloquea), Cat B por encima del límite y Cat A abierto. Los ITR se aprueban con el recorrido real (ejecutor =
 * dueño de la org A, supervisor = líder). Siembra en TEST_PROJECT_A_ID; al final reabre los ITR y borra todo.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_ROLE_LEADER_EMAIL', 'TEST_ROLE_LEADER_PASSWORD', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `CE${Date.now().toString(36).toUpperCase()}`
let owner: SupabaseClient
let leader: SupabaseClient
let svc: SupabaseClient
let ownerId = ''
const ids = { org: '', phase: '', disc: '', area: '', system: '', template: '', item: '' }
const subsystem: Record<string, string> = {}
const itrs: string[] = []

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function signIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { c, id: data.user!.id }
}

async function itrIn(key: string, approve: boolean) {
  const tag = await must<{ id: string }>('tag', owner.from('tags').insert({ project_id: pid, subsystem_id: subsystem[key], discipline_id: ids.disc, tag_number: `${stamp}-${key}-PT`, description: 'test' }).select('id').single())
  const created = await owner.rpc('create_itr', {
    p_id: crypto.randomUUID(), p_project_id: pid, p_tag_id: tag.id, p_subsystem_id: subsystem[key], p_template_id: ids.template,
    p_itr_number: `${stamp}-${key}`, p_assignments: { executor: ownerId, supervisor: LEADER },
  })
  if (created.error) throw new Error(`create_itr ${key}: ${created.error.message}`)
  const itrId = (created.data as { id: string }).id
  itrs.push(itrId)
  if (!approve) return
  await must('response', owner.from('itr_responses').insert({ itr_id: itrId, item_id: ids.item, value_bool: true }).select('id'))
  for (const [c, role] of [[owner, 'executor'], [leader, 'supervisor']] as const) {
    const { error } = await c.rpc('sign_itr_atomic', { p_itr_id: itrId, p_role: role })
    if (error) throw new Error(`firma ${role} ${key}: ${error.message}`)
  }
}

async function punches(key: string, categories: string) {
  for (const [i, category] of [...categories].entries()) {
    await must('punch', owner.from('punches').insert({
      project_id: pid, subsystem_id: subsystem[key], discipline_id: ids.disc, raised_by: ownerId, category,
      description: `TEST elegibilidad ${stamp} ${key} ${i}`, punch_number: '',
    }).select('id'))
  }
}

const CASES: Array<[string, string]> = [
  ['empty', 'red'], ['pending', 'red'], ['green', 'green'], ['yellow', 'yellow'], ['overB', 'red'], ['catA', 'red'],
]

describe('elegibilidad de certificados — SQL = TS (A29)', () => {
  beforeAll(async () => {
    ;({ c: owner, id: ownerId } = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!))
    ;({ c: leader } = await signIn(env.TEST_ROLE_LEADER_EMAIL!, env.TEST_ROLE_LEADER_PASSWORD!))
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    ids.org = (await must<{ org_id: string }>('project', owner.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', owner.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', owner.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.phase = phase.id; ids.disc = disc.id
    ids.area = (await must<{ id: string }>('area', owner.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    ids.system = (await must<{ id: string }>('system', owner.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
    for (const [key] of CASES) {
      subsystem[key] = (await must<{ id: string }>('subsystem', owner.from('subsystems').insert({ project_id: pid, system_id: ids.system, code: `${stamp}-${key}`, name: key }).select('id').single())).id
    }
    ids.template = (await must<{ id: string }>('template', owner.from('itr_templates').insert({
      org_id: ids.org, discipline_id: ids.disc, phase_id: ids.phase, code: `${stamp}-T`, title: 'elegibilidad', is_active: true, required_signatures: ['executor', 'supervisor'],
    }).select('id').single())).id
    const sec = await must<{ id: string }>('section', owner.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    ids.item = (await must<{ id: string }>('item', owner.from('itr_template_items').insert({
      template_id: ids.template, section_id: sec.id, description: 'check', item_type: 'checkbox', is_required: true, order_index: 0,
    }).select('id').single())).id

    await itrIn('pending', false)
    for (const key of ['green', 'yellow', 'overB', 'catA']) await itrIn(key, true)
    await punches('yellow', 'BBC')
    await punches('overB', 'BBBB')
    await punches('catA', 'A')
  }, 120_000)

  afterAll(async () => {
    // Un ITR firmado no se borra: reapertura auditada (el dueño de la org es privilegiado) y después se borra todo.
    for (const id of itrs) await owner.rpc('reopen_itr_atomic', { p_itr_id: id, p_reason: 'limpieza de la prueba A29' })
    for (const id of Object.values(subsystem)) await svc.from('punches').delete().eq('subsystem_id', id)
    if (ids.area) await svc.from('areas').delete().eq('id', ids.area)
    if (ids.template) await svc.from('itr_templates').delete().eq('id', ids.template)
  }, 60_000)

  for (const [key, level] of CASES) {
    it(`${key}: la BD y la app dicen «${level}»`, async () => {
      const [{ data: sql, error }, { data: itrRows }, { data: punchRows }, { data: org }] = await Promise.all([
        owner.rpc('certificate_eligibility', { p_subsystem_id: subsystem[key], p_phase_id: ids.phase }),
        owner.from('itrs').select('status').eq('subsystem_id', subsystem[key]).eq('phase_id', ids.phase),
        owner.from('punches').select('id, punch_number, description, category, status').eq('subsystem_id', subsystem[key]),
        owner.from('organizations').select('settings').eq('id', ids.org).single(),
      ])
      if (error) throw new Error(error.message)
      const ts = evaluateEligibility(itrRows ?? [], (punchRows ?? []) as PunchLike[], resolveCatBLimit(org?.settings))
      const s = sql as { eligible: string; totalItrs: number; approvedItrs: number; openCatA: number; openCatBPunches: unknown[]; catBLimit: number | null; catBOverLimit: boolean }
      expect({ eligible: ts.eligible, total: ts.totalItrs, approved: ts.approvedItrs, catA: ts.openCatA, catB: ts.openCatBPunches.length, limit: ts.catBLimit, over: ts.catBOverLimit })
        .toEqual({ eligible: s.eligible, total: s.totalItrs, approved: s.approvedItrs, catA: s.openCatA, catB: s.openCatBPunches.length, limit: s.catBLimit, over: s.catBOverLimit })
      expect(s.eligible).toBe(level)
    }, 30_000)
  }
})
