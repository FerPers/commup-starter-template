import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { gateWorkState } from '@/lib/readiness/work-state'
import { WORK_STATE_CASES } from '@/lib/readiness/work-state.cases'
import { requireDbEnv } from './env'

/**
 * A47 · E4 (migración 20261231120000): la función SQL `gate_work_state` y su espejo TS dan lo mismo en todos los casos
 * de `work-state.cases.ts`, y la matriz guardada (compute_project_gates) trae `work_state` en cada gate «no listo».
 * Solo lee (la función es IMMUTABLE y la matriz se calcula al leerla).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

let a: SupabaseClient

describe('«no listo» según su causa: TS = SQL (A47)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
  })

  for (const c of WORK_STATE_CASES) {
    it(c.name, async () => {
      const { data, error } = await a.rpc('gate_work_state', { p_status: c.status, p_criteria: c.criteria })
      expect(error).toBeNull()
      expect(data ?? null).toBe(c.expected)
      expect(gateWorkState(c.status, c.criteria)).toBe(c.expected)
    })
  }

  it('la matriz trae work_state en cada gate no listo, y solo en esos', async () => {
    const { data, error } = await a.rpc('compute_project_gates', { p_project_id: env.TEST_PROJECT_A_ID! })
    expect(error).toBeNull()
    const gates = ((data ?? []) as { gates: { status: string; work_state?: string | null }[] }[]).flatMap(r => r.gates)
    for (const g of gates) {
      if (g.status === 'not_ready') expect(['nodata', 'work', 'blocked']).toContain(g.work_state)
      else expect(g.work_state ?? null).toBeNull()
    }
  })
})
