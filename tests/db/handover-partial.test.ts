import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { requireDbEnv } from './env'

/**
 * A10 (migración 20261220120000) contra la BD real:
 *   - el estado PARTIAL existe y lleva `omitted_count`;
 *   - verify_handover_package verifica ISSUED y PARTIAL y dice cuál es completo (`complete`, `omitted`);
 *   - un paquete FAILED no se verifica.
 * Filas sembradas con la llave de servicio de la Supabase local (verify es solo service_role); se borran al final.
 */
const env = process.env
requireDbEnv(['TEST_PROJECT_A_ID', 'TEST_SUPABASE_SERVICE_ROLE_KEY'])

const pid = env.TEST_PROJECT_A_ID!
let svc: SupabaseClient
let orgId = ''
const ids: string[] = []
const hash = () => randomBytes(32).toString('hex')

async function seed(status: string, omitted: { path: string; reason: string }[]) {
  const signature_hash = hash()
  const { data, error } = await svc.from('handover_packages').insert({
    org_id: orgId, project_id: pid, status, version: '3.0', signature_hash, signature_alg: 'ed25519', key_id: 'k-test',
    omitted_count: omitted.length, manifest: { files: [], omitted, complete: omitted.length === 0 },
  }).select('id').single()
  if (error) throw new Error(`seed ${status}: ${error.message}`)
  ids.push(data.id)
  return signature_hash
}

describe('handover parcial (A10)', () => {
  beforeAll(async () => {
    svc = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await svc.from('projects').select('org_id').eq('id', pid).single()
    if (error) throw new Error(error.message)
    orgId = data.org_id
  })

  afterAll(async () => {
    if (ids.length) await svc.from('handover_packages').delete().in('id', ids)
  })

  it('un paquete completo se verifica como completo', async () => {
    const { data } = await svc.rpc('verify_handover_package', { p_hash: await seed('ISSUED', []) })
    expect(data).toMatchObject({ status: 'ISSUED', complete: true, omitted: [] })
  })

  it('un paquete parcial se verifica, pero marcado como no completo y con lo omitido', async () => {
    const omitted = [{ path: 'anexos/S01/itr/x.pdf', reason: 'más de 600 ITR por paquete' }]
    const { data } = await svc.rpc('verify_handover_package', { p_hash: await seed('PARTIAL', omitted) })
    expect(data).toMatchObject({ status: 'PARTIAL', complete: false, omitted })
  })

  it('un paquete fallido no se verifica', async () => {
    const { data } = await svc.rpc('verify_handover_package', { p_hash: await seed('FAILED', []) })
    expect(data).toBeNull()
  })

  it('un estado desconocido sigue rechazado', async () => {
    const { error } = await svc.from('handover_packages').insert({ org_id: orgId, project_id: pid, status: 'COMPLETE', version: '3.0' })
    expect(error?.message).toMatch(/handover_packages_status_check/)
  })
})
