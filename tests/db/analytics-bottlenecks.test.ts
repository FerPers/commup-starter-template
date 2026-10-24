import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A30 (migración 20261225120000): analytics_bottlenecks («Cuellos de botella» en Calidad de datos) lee los eventos
 * actuales (`itr.approved` / `itr.rejected`). Antes filtraba `itrs.updated`, que ya no existe: todo subsistema con ITR
 * pendientes salía «sin avance en 14 días» y los rechazos recientes daban siempre 0.
 * Los eventos se insertan con la llave de servicio (como los emite el trigger); se borran al final.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `BN${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let svc: SupabaseClient
const ids = { org: '', area: '', sub: '', template: '', itr: '' }
const events: string[] = []

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

const row = () => must<{ reasons: string[]; recent_rejects: number }>('bottleneck',
  a.from('analytics_bottlenecks').select('reasons, recent_rejects').eq('subsystem_id', ids.sub).single())

async function event(type: 'itr.approved' | 'itr.rejected') {
  const e = await must<{ id: string }>(type, svc.from('domain_events').insert({
    org_id: ids.org, project_id: pid, aggregate_type: 'itr', aggregate_id: ids.itr, event_type: type,
    payload: { id: ids.itr, project_id: pid, subsystem_id: ids.sub, status: type === 'itr.approved' ? 'approved' : 'rejected' },
  }).select('id').single())
  events.push(e.id)
}

describe('cuellos de botella con los eventos actuales (A30)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    const tag = await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())
    ids.template = (await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: ids.org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-T`, title: 'test', is_active: true, required_signatures: ['executor', 'supervisor'],
    }).select('id').single())).id
    const me = (await a.auth.getUser()).data.user!.id
    const created = await a.rpc('create_itr', {
      p_id: crypto.randomUUID(), p_project_id: pid, p_tag_id: tag.id, p_subsystem_id: ids.sub, p_template_id: ids.template,
      p_itr_number: `${stamp}-ITR`, p_assignments: { executor: me, supervisor: LEADER },
    })
    if (created.error) throw new Error(`create_itr: ${created.error.message}`)
    ids.itr = (created.data as { id: string }).id
  }, 30_000)

  afterAll(async () => {
    if (events.length) await svc.from('domain_events').delete().in('id', events)
    if (ids.area) await a.from('areas').delete().eq('id', ids.area)
    if (ids.template) await a.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('sin aprobaciones recientes y con ITR pendientes: «sin avance en 14 días»', async () => {
    expect(await row()).toMatchObject({ recent_rejects: 0, reasons: expect.arrayContaining(['no_velocity_14d']) })
  })

  it('una aprobación reciente (itr.approved) quita «sin avance»', async () => {
    await event('itr.approved')
    expect((await row()).reasons).not.toContain('no_velocity_14d')
  })

  it('un rechazo reciente (itr.rejected) cuenta como rechazo reciente', async () => {
    await event('itr.rejected')
    expect(await row()).toMatchObject({ recent_rejects: 1, reasons: expect.arrayContaining(['recent_rejections']) })
  })
})
