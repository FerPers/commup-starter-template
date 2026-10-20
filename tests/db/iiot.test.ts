import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * S12 — IIoT confiable (migración 20261107120000) contra la BD real, solo lecturas:
 *   - signal_series: rango sargable, tope de puntos y de rango, membresía;
 *   - la ingesta no es ejecutable por un usuario (solo service_role vía /api/v1/signals/samples).
 * La validación por muestra, ambiguous_signal, upsert, la partición y la retención se probaron con ROLLBACK en
 * la migración (escriben muestras).
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)
const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient

describe.skipIf(!enabled)('IIoT (S12)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
  }, 30_000)

  it('signal_series rechaza rangos de más de 35 días y respeta el tope de puntos', async () => {
    const { data: sig } = await a.from('signals').select('id, tags!inner(project_id)').eq('tags.project_id', pid).limit(1)
    const ids = (sig ?? []).map(s => s.id)
    if (ids.length === 0) return
    const now = Date.now()
    const tooLong = await a.rpc('signal_series', { p_signal_ids: ids, p_from: new Date(now - 40 * 86_400_000).toISOString(), p_to: new Date(now).toISOString() })
    expect(tooLong.error?.message).toMatch(/35 días/)
    const { data, error } = await a.rpc('signal_series', {
      p_signal_ids: ids, p_from: new Date(now - 30 * 86_400_000).toISOString(), p_to: new Date(now).toISOString(), p_bucket_s: 1, p_max_points: 100,
    })
    expect(error).toBeNull()
    expect((data ?? []).length).toBeLessThanOrEqual(101)
  })

  it('signal_series no devuelve señales de otra org', async () => {
    const { error } = await a.rpc('signal_series', {
      p_signal_ids: [crypto.randomUUID()], p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date().toISOString(),
    })
    expect(error?.message).toMatch(/Access denied/)
  })

  it('la ingesta no es ejecutable por un usuario autenticado', async () => {
    const { error } = await a.rpc('ingest_signal_samples', {
      p_org_id: crypto.randomUUID(), p_source: 'MANUAL', p_source_system: null, p_idempotency_key: null, p_api_key_id: null, p_samples: [],
    })
    expect(error).not.toBeNull()
  })
})
