import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * S03 (E-26, 2026-10-19): desde la migración canónica ya no se parchea una función con
 * `replace(pg_get_functiondef(…))`. Una función central se cambia en `supabase/functions-sql/<nombre>.sql`
 * y la migración lleva su `CREATE OR REPLACE` completo (`scripts/sql/canonical-functions.mjs emit`).
 */
const CANONICAL_MIGRATION = '20261028120000'
const DIR = join(process.cwd(), 'supabase/migrations')

describe('migraciones sin parches por ancla', () => {
  const later = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f.slice(0, 14) > CANONICAL_MIGRATION)

  it.each(later.length ? later : ['(ninguna todavía)'])('%s no usa pg_get_functiondef', (f) => {
    if (!f.endsWith('.sql')) return
    expect(readFileSync(join(DIR, f), 'utf8')).not.toMatch(/pg_get_functiondef/i)
  })
})
