import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { evaluateTable } from '@/lib/itr/table'
import { ACCEPTANCE_CASES, ACCEPTANCE_CONFIGS } from '@/lib/itr/table-acceptance.cases'
import { requireDbEnv } from './env'

/**
 * A36 (migración 20261223120000): evaluate_itr_table (la que usa sign_itr_atomic) decide igual que evaluateTable
 * (la que ve el inspector) en los casos de aceptación: selecciones que deciden, la columna que decide, N/A con
 * justificación, resultado automático sin desviación y configuraciones inválidas. Solo lectura (RPC inmutable).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD'])

describe('aceptación en tablas (A36) — SQL = TS', () => {
  it(`los ${ACCEPTANCE_CASES.length} casos coinciden y dan lo esperado`, async () => {
    const a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error: loginError } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (loginError) throw new Error(`login A: ${loginError.message}`)
    const wrong: string[] = []
    for (const [name, cfg, value, complete, fail] of ACCEPTANCE_CASES) {
      const ts = evaluateTable(ACCEPTANCE_CONFIGS[cfg], value)
      const { data, error } = await a.rpc('evaluate_itr_table', { p_options: ACCEPTANCE_CONFIGS[cfg], p_value: value })
      if (error) throw new Error(`${name}: ${error.message}`)
      const sql = data as { is_complete: boolean; has_fail: boolean }
      const want = JSON.stringify([complete, fail])
      const got = { ts: JSON.stringify([ts.isComplete, ts.hasFail]), sql: JSON.stringify([sql.is_complete, sql.has_fail]) }
      if (got.ts !== want || got.sql !== want) wrong.push(`${name}: esperado=${want} ts=${got.ts} sql=${got.sql}`)
    }
    expect(wrong).toEqual([])
  }, 60_000)
})
