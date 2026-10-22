#!/usr/bin/env node
/**
 * Corre un .sql del banco por bloques `-- @@chunk <título>` con `supabase db query`, uno por petición (cada bloque
 * es una transacción corta). Se detiene en el primer error (lo ya confirmado queda: teardown.sql lo borra).
 *
 * Nunca contra prod (--linked): el 2026-10-22 la siembra por la API de administración dejó una transacción viva con
 * bloqueos de ALTER TABLE y prod quedó sin BD ~30 min. Solo la BD local o una rama por URL.
 *
 *   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql                      (supabase start)
 *   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql --db-url <url-rama>  (rama de Supabase)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [file, flag, dbUrl] = process.argv.slice(2)
if (!file || (flag && flag !== '--db-url') || (flag === '--db-url' && !dbUrl)) {
  console.error('Uso: node scripts/loadtest/run.mjs <archivo.sql> [--db-url <url>]   (por defecto, la BD local)')
  process.exit(1)
}
if (dbUrl?.includes('mdyljpgzvigzjpqluket')) {
  console.error('Esa URL es prod: el banco no se siembra ni se mide en prod (ver seed.sql).')
  process.exit(1)
}
const target = dbUrl ? ['--db-url', dbUrl] : ['--local']
const parts = readFileSync(file, 'utf8').split(/^-- @@chunk (.*)$/m)
const chunks = []
for (let i = 1; i < parts.length; i += 2) chunks.push({ title: parts[i].trim(), sql: parts[i + 1] })
if (chunks.length === 0) chunks.push({ title: file, sql: parts[0] })

const dir = mkdtempSync(join(tmpdir(), 'lt-'))
try {
  for (const [n, c] of chunks.entries()) {
    const path = join(dir, `chunk-${n}.sql`)
    writeFileSync(path, c.sql)
    const t0 = Date.now()
    process.stdout.write(`[${n + 1}/${chunks.length}] ${c.title} … `)
    let out
    try {
      out = execFileSync('supabase', ['db', 'query', ...target, '-o', 'table', '-f', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      console.log(`ERROR (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
      console.error(String(e.stdout ?? '') + String(e.stderr ?? e.message))
      process.exit(1)
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`)
    // Tablas de resultados (bench, conteo final); los bloques de escritura no devuelven filas.
    if (/│/.test(out)) console.log(out.trim())
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
