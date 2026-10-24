import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * S03 (D-09/B-19/E-26/F-35, 2026-10-19): deriva entre las funciones canónicas del repo
 * (`supabase/functions-sql/*.sql`) y lo que corre en la BD.
 *
 * `function_definition_md5` (migración 20261028120000) devuelve solo el md5 de `pg_get_functiondef`
 * sin espacios finales: nunca el cuerpo. Aquí se calcula el mismo md5 del archivo (sin la cabecera
 * de comentarios ni el `;` final). Si falla: alguien cambió la función sin pasar por su archivo, o el
 * archivo sin migración. Arreglo: `node scripts/sql/canonical-functions.mjs dump` y revisar el diff.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD'], { readOnly: true })

const DIR = join(process.cwd(), 'supabase/functions-sql')
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => {
    const text = readFileSync(join(DIR, f), 'utf8')
    const sig = text.match(/^-- fn: (.+)$/m)?.[1]
    const body = text.replace(/^(--.*\n)+/, '').replace(/;\s*$/, '').replace(/\s+$/, '')
    return { file: f, sig: sig ?? '', md5: createHash('md5').update(body, 'utf8').digest('hex') }
  })

describe('funciones canónicas = BD', () => {
  let a: SupabaseClient
  let remote = new Map<string, string>()

  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error: authError } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (authError) throw authError
    const { data, error } = await a.rpc('function_definition_md5', { p_signatures: files.map((f) => f.sig) })
    if (error) throw new Error(`function_definition_md5: ${error.message}`)
    remote = new Map((data as { signature: string; md5: string }[]).map((r) => [r.signature, r.md5]))
  })

  it('hay archivos canónicos con cabecera', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f.sig, f.file).toMatch(/^public\.\w+\(.*\)$/)
  })

  for (const f of files) {
    it(`${f.file} coincide con la BD`, () => {
      expect(remote.has(f.sig), `${f.sig} no existe en la BD`).toBe(true)
      expect(remote.get(f.sig), `${f.file} difiere de la BD`).toBe(f.md5)
    })
  }
})
