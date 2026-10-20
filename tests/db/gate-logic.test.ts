import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * S11 — lógica de gates (migración 20261106120000) contra la BD real, solo lecturas y rechazos:
 *   - política de regresión por defecto (D13) y paridad con `gatePolicy` en TS;
 *   - PSSR: una sola regla (el más reciente) en el gate y en los prerrequisitos de arranque (D-11);
 *   - gate de arranque explícito (E-07);
 *   - retirar una declaración exige motivo (D-21).
 * La propagación de la regresión, el corte de punch nuevos en gates aprobados y el KPI de compromisos se
 * probaron con ROLLBACK en la migración (necesitan aprobaciones, que no se borran).
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)
const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient
let orgId: string

describe.skipIf(!enabled)('lógica de gates (S11)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    const { data } = await a.from('projects').select('org_id').eq('id', pid).single()
    orgId = data!.org_id
  }, 30_000)

  it('política por defecto: anterior en regresión bloquea, proveedor en regresión es condición, punch nuevo no regresa aprobados', async () => {
    const [{ data: policy }, { data: org }] = await Promise.all([
      a.rpc('org_gate_policy', { p_org_id: orgId }),
      a.from('organizations').select('settings').eq('id', orgId).single(),
    ])
    const { gatePolicy } = await import('@/lib/readiness/gates')
    expect(policy).toEqual(gatePolicy(org?.settings))
    if (!(org?.settings as { gate_policy?: unknown } | null)?.gate_policy) {
      expect(policy).toEqual({ regressed_previous: 'block', regressed_dependency: 'condition', cat_a_regresses_approved: false })
    }
  })

  it('PSSR: el gate y el arranque leen la misma regla (el más reciente) y el gate de arranque es el marcado', async () => {
    const { data: systems } = await a.from('systems').select('id').eq('project_id', pid).limit(3)
    const { data: startupGate } = await a.from('readiness_gates').select('id').eq('org_id', orgId).eq('is_startup_gate', true).maybeSingle()
    for (const s of systems ?? []) {
      const [{ data: pssr }, { data: pre }, { data: latest }] = await Promise.all([
        a.rpc('system_pssr_status', { p_system_id: s.id }),
        a.rpc('startup_prerequisites', { p_system_id: s.id }),
        a.from('pssr_reviews').select('status').eq('system_id', s.id).order('created_at', { ascending: false }).limit(1),
      ])
      expect((pssr as { review_status?: string }).review_status ?? 'none').toBe(latest?.[0]?.status ?? 'none')
      expect((pre as { pssr_status: string }).pssr_status).toBe(latest?.[0]?.status ?? 'none')
      if (startupGate) expect((pre as { gate_id: string }).gate_id).toBe(startupGate.id)
    }
  })

  it('retirar una declaración sin motivo se rechaza', async () => {
    const { error } = await a.rpc('revoke_gate_attestation', { p_attestation_id: '00000000-0000-0000-0000-000000000000', p_reason: '' })
    expect(error).not.toBeNull()
  })
})
