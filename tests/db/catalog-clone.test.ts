import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Biblioteca de formatos (Fase 6): clone_itr_template_from_catalog y
 * list_catalog_template_updates respetan membresía y RLS. Se ejecuta solo con
 * las mismas credenciales de prueba que rls-smoke.test.ts; en CI se omite.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_B_EMAIL && env.TEST_PROJECT_A_ID)

async function signedIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

describe.skipIf(!enabled)('Biblioteca de formatos: clonación desde el catálogo', () => {
  it('el usuario B no puede clonar hacia la org de A (sin membresía de editor)', async () => {
    const a = await signedIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const { data: project } = await a.from('projects').select('org_id').eq('id', env.TEST_PROJECT_A_ID!).single()
    expect(project?.org_id).toBeTruthy()
    // Cualquier plantilla visible para B (su propia org); si no tiene, no hay caso que probar.
    const { data: source } = await b.from('itr_templates').select('id').eq('is_active', true).limit(1).maybeSingle()
    if (!source) return
    const { data, error } = await b.rpc('clone_itr_template_from_catalog', {
      p_source_template_id: source.id,
      p_target_org_id: project!.org_id,
    })
    expect(data).toBeNull()
    expect(error?.message ?? '').toMatch(/membership/i)
  })

  it('el usuario A no puede clonar una plantilla de la org de B si B no es catálogo', async () => {
    const a = await signedIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const { data: project } = await a.from('projects').select('org_id').eq('id', env.TEST_PROJECT_A_ID!).single()
    const { data: source } = await b.from('itr_templates').select('id, org_id').eq('is_active', true).limit(1).maybeSingle()
    if (!source) return
    const { data: sourceOrg } = await a.from('organizations').select('settings').eq('id', source.org_id).maybeSingle()
    const isCatalog = !!((sourceOrg?.settings as Record<string, unknown> | null)?.is_template_catalog)
    if (isCatalog) return
    const { data, error } = await a.rpc('clone_itr_template_from_catalog', {
      p_source_template_id: source.id,
      p_target_org_id: project!.org_id,
    })
    expect(data).toBeNull()
    expect(error?.message ?? '').toMatch(/not found|membership/i)
  })

  it('list_catalog_template_updates de la org de A devuelve vacío para el usuario B', async () => {
    const a = await signedIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    const b = await signedIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const { data: project } = await a.from('projects').select('org_id').eq('id', env.TEST_PROJECT_A_ID!).single()
    const { data, error } = await b.rpc('list_catalog_template_updates', { p_org_id: project!.org_id })
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
  })
})
