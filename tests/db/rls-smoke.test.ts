import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Smoke de aislamiento multi-tenant (Sprint T). Se ejecuta solo si hay
 * credenciales de prueba en el entorno; en CI sin secretos se omite.
 *
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD   (org A)
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD   (org B, sin membresía en A)
 *   TEST_PROJECT_A_ID                          (proyecto de la org A)
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_B_EMAIL && env.TEST_PROJECT_A_ID)

async function signedIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

describe.skipIf(!enabled)('RLS multi-tenant smoke', () => {
  it('el usuario A ve tags de su proyecto; el usuario B no ve ninguno', async () => {
    const a = await signedIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const pid = env.TEST_PROJECT_A_ID!

    const [ra, rb] = await Promise.all([
      a.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', pid),
      b.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', pid),
    ])
    expect(ra.error).toBeNull()
    expect(rb.error).toBeNull()
    expect(ra.count ?? 0).toBeGreaterThan(0)
    expect(rb.count ?? 0).toBe(0)
  })

  it('las vistas paginables y los RPC de conteo respetan RLS', async () => {
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const pid = env.TEST_PROJECT_A_ID!
    const [v, rpc] = await Promise.all([
      b.from('itr_list_v').select('id', { count: 'exact', head: true }).eq('project_id', pid),
      b.rpc('itr_status_counts', { p_project_id: pid }),
    ])
    expect(v.count ?? 0).toBe(0)
    expect((rpc.data ?? []).length).toBe(0)
  })

  it('el usuario B no puede insertar en el proyecto de A', async () => {
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const { error } = await b.from('areas').insert({ project_id: env.TEST_PROJECT_A_ID!, code: 'HACK', name: 'x' })
    expect(error).not.toBeNull()
  })
})
