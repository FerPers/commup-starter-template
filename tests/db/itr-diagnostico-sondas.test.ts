import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateTable } from '@/lib/itr/table'
import { evaluateContinuity } from '@/lib/itr/continuity'
import probes from '@/lib/itr/diagnostico-sondas.fixture.json'
import { requireDbEnv } from './env'

/**
 * A45 (2026-10-24): las sondas del diagnóstico ITR contra el evaluador SQL (evaluate_itr_table / evaluate_itr_continuity,
 * los que usa sign_itr_atomic). Primero: SQL = TS en cada sonda (la corrección tiene que llegar a los dos). Después,
 * lo que el motor DEBERÍA hacer, con `it.fails` como en src/lib/itr/diagnostico-sondas.test.ts: se quita el `.fails`
 * cuando la corrección lo cierre. Solo lectura (RPC inmutables).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD'])

type SqlResult = { is_complete: boolean; has_fail: boolean }
const rejects = (r: SqlResult) => r.has_fail || !r.is_complete
let a: SupabaseClient
const sql = new Map<string, SqlResult>()

describe('sondas del diagnóstico ITR en SQL (A45)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    const calls = {
      inconsistentEffect: a.rpc('evaluate_itr_table', { p_options: probes.inconsistentEffect.options, p_value: JSON.stringify(probes.inconsistentEffect.input), p_source_count: probes.inconsistentEffect.sourceRows.length }),
      calibrationManual: a.rpc('evaluate_itr_table', { p_options: probes.calibrationManual.options, p_value: JSON.stringify(probes.calibrationManual.input) }),
      optionalResult: a.rpc('evaluate_itr_table', { p_options: probes.optionalResult.options, p_value: JSON.stringify(probes.optionalResult.input) }),
      continuitySelfDeclared: a.rpc('evaluate_itr_continuity', { p_value: JSON.stringify(probes.continuitySelfDeclared.input) }),
    }
    for (const [key, call] of Object.entries(calls)) {
      const { data, error: rpcError } = await call
      if (rpcError) throw new Error(`${key}: ${rpcError.message}`)
      sql.set(key, data as SqlResult)
    }
  })

  it('SQL y TS evalúan igual cada sonda', () => {
    const ts = {
      inconsistentEffect: evaluateTable(probes.inconsistentEffect.options, JSON.stringify(probes.inconsistentEffect.input), probes.inconsistentEffect.sourceRows),
      calibrationManual: evaluateTable(probes.calibrationManual.options, JSON.stringify(probes.calibrationManual.input)),
      optionalResult: evaluateTable(probes.optionalResult.options, JSON.stringify(probes.optionalResult.input)),
      continuitySelfDeclared: evaluateContinuity(JSON.stringify(probes.continuitySelfDeclared.input)),
    }
    for (const [key, r] of Object.entries(ts)) {
      expect({ is_complete: sql.get(key)?.is_complete, has_fail: sql.get(key)?.has_fail }, key).toEqual({ is_complete: r.isComplete, has_fail: r.hasFail })
    }
  })

  it.fails('H1 · I30C v3 E.1: «Ejecutó la acción = No» con resultado conforme no se acepta', () => {
    expect(rejects(sql.get('inconsistentEffect')!)).toBe(true)
  })

  it.fails('H2 · I10A v3 4.01: salida esperada 12, observada 99 y error manual 0 no pasa como conforme', () => {
    expect(rejects(sql.get('calibrationManual')!)).toBe(true)
  })

  it.fails('H3 · E10B v2 M.1: una tabla con el resultado vacío no queda completa', () => {
    expect(sql.get('optionalResult')!.is_complete).toBe(false)
  })
})
