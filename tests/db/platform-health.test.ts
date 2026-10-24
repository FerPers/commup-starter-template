import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A15 (2026-10-24): salud de la plataforma y alertas a los operadores.
 *   - solo un operador ve platform_health(); las funciones internas y el latido son de service_role;
 *   - un cron que pasa a rojo avisa una vez (campana) y avisa otra vez cuando se resuelve.
 * Usa el owner de la org A como operador temporal; al final lo quita junto con su latido, estado y avisos.
 */
const env = process.env
requireDbEnv(['TEST_SUPABASE_SERVICE_ROLE_KEY', 'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const JOB = 'push-dispatch'
const KEY = `cron:${JOB}`
let svc: SupabaseClient, owner: SupabaseClient
let ownerId = '', orgId = ''

async function alerts(kind: string) {
  const { data } = await svc.from('notifications').select('id, title, link_url').eq('recipient_user_id', ownerId).eq('kind', kind).eq('payload->>check', KEY)
  return data ?? []
}

describe('salud de la plataforma (A15)', () => {
  beforeAll(async () => {
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    owner = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data, error } = await owner.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    ownerId = data.user!.id
    orgId = (await svc.from('projects').select('org_id').eq('id', env.TEST_PROJECT_A_ID!).single()).data!.org_id
    await svc.from('notifications').delete().eq('recipient_user_id', ownerId).in('kind', ['platform_health_alert', 'platform_health_recovered'])
    await svc.from('platform_health_state').delete().eq('key', KEY)
    await svc.from('cron_heartbeats').delete().eq('job', JOB)
  })

  afterAll(async () => {
    await svc.from('platform_operators').delete().eq('user_id', ownerId)
    await svc.from('notifications').delete().eq('recipient_user_id', ownerId).in('kind', ['platform_health_alert', 'platform_health_recovered'])
    await svc.from('platform_health_state').delete().eq('key', KEY)
    await svc.from('cron_heartbeats').delete().eq('job', JOB)
  })

  it('un miembro que no es operador no ve la salud ni corre las funciones internas', async () => {
    expect((await owner.rpc('platform_health')).error?.code).toBe('42501')
    for (const [fn, args] of [['platform_health_checks', {}], ['platform_health_alert', {}], ['record_cron_run', { p_job: JOB, p_ok: true }]] as const) {
      expect((await owner.rpc(fn, args)).error?.code, fn).toBe('42501')
    }
    expect((await owner.from('platform_operators').insert({ user_id: ownerId, org_id: orgId })).error?.code).toBe('42501')
    expect((await owner.from('cron_heartbeats').select('job')).error?.code).toBe('42501')
  })

  it('el operador ve los chequeos; sin latido el cron queda en ámbar', async () => {
    expect((await svc.from('platform_operators').insert({ user_id: ownerId, org_id: orgId })).error).toBeNull()
    const { data, error } = await owner.rpc('platform_health')
    expect(error).toBeNull()
    const checks = (data as { checks: Array<{ key: string; status: string; code: string }> }).checks
    expect(checks.find(c => c.key === KEY)).toMatchObject({ status: 'warn', code: 'no_runs' })
    for (const key of ['queue:domain_events', 'queue:push', 'queue:webhooks', 'webhooks:abandoned', 'handover:failed', 'sync:conflicts']) {
      expect(checks.map(c => c.key), key).toContain(key)
    }
  })

  it('un cron que falla avisa una vez y avisa al resolverse', async () => {
    expect((await svc.rpc('record_cron_run', { p_job: JOB, p_ok: false, p_error: 'HTTP 500 boom' })).error).toBeNull()
    expect((await svc.rpc('platform_health_alert')).error).toBeNull()
    const first = await alerts('platform_health_alert')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ title: `Salud de la plataforma: ${JOB}`, link_url: '/admin/health' })
    // Sigue en rojo: no repite.
    await svc.rpc('platform_health_alert')
    expect(await alerts('platform_health_alert')).toHaveLength(1)
    // Corrida correcta: sale de rojo y avisa que se resolvió.
    await svc.rpc('record_cron_run', { p_job: JOB, p_ok: true })
    await svc.rpc('platform_health_alert')
    expect(await alerts('platform_health_recovered')).toHaveLength(1)
    const { data } = await svc.from('cron_heartbeats').select('runs_ok, runs_failed, last_error').eq('job', JOB).single()
    expect(data).toEqual({ runs_ok: 1, runs_failed: 1, last_error: 'HTTP 500 boom' })
  })
})
