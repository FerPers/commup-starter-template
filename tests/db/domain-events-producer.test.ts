import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * A04 (migración 20261219120000) contra la BD real: el trigger emit_domain_event es el único productor.
 *   - un alta como la de la API v1 (service role con x-commup-source / x-commup-key-id) deja UN `tag.created`,
 *     con `payload.context` = {source, api_key_id};
 *   - un usuario no puede declarar ese origen (la cabecera solo vale con service role);
 *   - pasar un punch a Operaciones desde la app (RPC con sesión) emite `punch.transferred_to_ops`, igual que la API.
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía; al final la borra.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `EP${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let api: SupabaseClient
let userId = ''
const ids = { area: '', sub: '', disc: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function events(aggregateId: string) {
  const { data } = await a.from('domain_events').select('event_type, payload, actor_id').eq('aggregate_id', aggregateId)
  return data ?? []
}

describe('domain_events — un solo productor con el contexto de la API (A04)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      // Un usuario que intenta declararse API: el trigger lo ignora.
      global: { headers: { 'x-commup-source': 'api_v1', 'x-commup-key-id': 'falsa' } },
    })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    userId = auth.user!.id
    // Igual que createAdminClient({ apiKeyId }) de la API v1, contra la Supabase local.
    api = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-commup-source': 'api_v1', 'x-commup-key-id': 'key-123' } },
    })

    const org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    ids.disc = (await must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', org).limit(1).single())).id
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    // Los punches no caen en cascada con el subsistema; el service role los borra aunque estén en Operaciones.
    if (ids.sub) await api.from('punches').delete().eq('subsystem_id', ids.sub)
    if (ids.area) await a.from('areas').delete().eq('id', ids.area)
  }, 30_000)

  it('un alta por la API deja un solo tag.created, con su origen y su llave', async () => {
    const tag = await must<{ id: string }>('tag', api.from('tags').insert({
      project_id: pid, subsystem_id: ids.sub, discipline_id: ids.disc, tag_number: `${stamp}-API`, description: 'api',
    }).select('id').single())
    const created = (await events(tag.id)).filter(e => e.event_type === 'tag.created')
    expect(created).toHaveLength(1)
    expect(created[0].payload).toMatchObject({ context: { source: 'api_v1', api_key_id: 'key-123' } })
    expect(created[0].actor_id).toBeNull()
  })

  it('un usuario no puede declararse API: su evento no trae contexto y lleva su autoría', async () => {
    const tag = await must<{ id: string }>('tag', a.from('tags').insert({
      project_id: pid, subsystem_id: ids.sub, discipline_id: ids.disc, tag_number: `${stamp}-APP`, description: 'app',
    }).select('id').single())
    const created = (await events(tag.id)).filter(e => e.event_type === 'tag.created')
    expect(created).toHaveLength(1)
    expect(created[0].payload).not.toHaveProperty('context')
    expect(created[0].actor_id).toBe(userId)
  })

  it('pasar un punch a Operaciones desde la app emite punch.transferred_to_ops (antes solo la API)', async () => {
    const punch = await must<{ id: string }>('punch', a.from('punches').insert({
      project_id: pid, subsystem_id: ids.sub, discipline_id: ids.disc, raised_by: userId, category: 'B',
      description: `TEST operaciones ${stamp}`, punch_number: '',
    }).select('id').single())
    const { error } = await a.rpc('transfer_punch_to_ops', { p_punch_id: punch.id, p_transferred_to: LEADER })
    expect(error).toBeNull()
    const ops = (await events(punch.id)).filter(e => e.event_type === 'punch.transferred_to_ops')
    expect(ops).toHaveLength(1)
    expect(ops[0].payload).toMatchObject({ status: 'transferred_to_ops', previous_status: 'active', transferred_to: LEADER })
    expect(ops[0].actor_id).toBe(userId)
  })
})
