import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * S14 — Firmantes designados (migración 20261109120000) contra la BD real, solo lecturas y rechazos:
 *   - my_capacities devuelve las 4 capacidades con su modo (designado o respaldo);
 *   - project_capacities no admite escritura directa (solo RPC de owner/admin);
 *   - la RPC rechaza capacidades inválidas y proyectos ajenos.
 * El flujo completo (designar, firmar Operaciones con un inspector designado, bloquear a un owner no designado,
 * firma Cliente del ITR, E-30) se probó con ROLLBACK en la migración porque escribe.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)
const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient

describe.skipIf(!enabled)('Firmantes designados (S14)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
  }, 30_000)

  it('my_capacities devuelve las cuatro capacidades', async () => {
    const { data, error } = await a.rpc('my_capacities', { p_project_id: pid })
    expect(error).toBeNull()
    expect((data ?? []).map((r: { capacity: string }) => r.capacity).sort()).toEqual(['client_rep', 'commissioning', 'hse', 'operations'])
  })

  it('project_capacities no se escribe directo', async () => {
    const { data: me } = await a.auth.getUser()
    const { error } = await a.from('project_capacities').insert({
      org_id: crypto.randomUUID(), project_id: pid, user_id: me.user!.id, capacity: 'operations', assigned_by: me.user!.id,
    })
    expect(error).not.toBeNull()
  })

  it('assign_project_capacity rechaza capacidades inválidas y proyectos ajenos', async () => {
    const { data: me } = await a.auth.getUser()
    const bad = await a.rpc('assign_project_capacity', { p_project_id: pid, p_user_id: me.user!.id, p_capacity: 'superuser' })
    expect(bad.error).not.toBeNull()
    const other = await a.rpc('assign_project_capacity', { p_project_id: crypto.randomUUID(), p_user_id: me.user!.id, p_capacity: 'operations' })
    expect(other.error?.message).toMatch(/Proyecto no encontrado|owner o admin/)
  })
})
