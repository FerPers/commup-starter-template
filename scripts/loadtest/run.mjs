#!/usr/bin/env node
/**
 * Corre un .sql del banco por bloques `-- @@chunk <título>` con `supabase db query`, uno por petición (cada bloque
 * es una transacción corta). Se detiene en el primer error de un bloque que escribe (lo ya confirmado queda:
 * teardown.sql lo borra); los de solo lectura (terminan en ROLLBACK) siguen.
 *
 * Nunca contra prod: el 2026-10-22 la siembra por la API de administración dejó una transacción viva con bloqueos
 * de ALTER TABLE y prod quedó sin BD ~30 min. Destinos: la BD local, una URL, o un directorio enlazado
 * (`supabase link --workdir <dir>`) a un proyecto aparte; el repo sigue enlazado a prod y no se usa.
 *
 *   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql                         (supabase start)
 *   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql --db-url <url>          (rama o proyecto aparte)
 *   node scripts/loadtest/run.mjs scripts/loadtest/seed.sql --workdir <dir-enlazado> (proyecto aparte por la API)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PROD_REF = 'mdyljpgzvigzjpqluket'

const [file, flag, value] = process.argv.slice(2)
if (!file || (flag && !['--db-url', '--workdir'].includes(flag)) || (flag && !value)) {
  console.error('Uso: node scripts/loadtest/run.mjs <archivo.sql> [--db-url <url> | --workdir <dir>]   (por defecto, la BD local)')
  process.exit(1)
}
const refFile = flag === '--workdir' ? join(value, 'supabase/.temp/project-ref') : null
const ref = refFile && existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : null
if ((flag === '--db-url' && value.includes(PROD_REF)) || (flag === '--workdir' && (!ref || ref === PROD_REF))) {
  console.error('Ese destino es prod (o no está enlazado): el banco no se siembra ni se mide en prod (ver seed.sql).')
  process.exit(1)
}
const target = flag === '--db-url' ? ['--db-url', value] : flag === '--workdir' ? ['--linked', '--workdir', value] : ['--local']
const abs = (p) => resolve(p)
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
      out = execFileSync('supabase', ['db', 'query', ...target, '-o', 'table', '-f', abs(path)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      const msg = String(e.stdout ?? '') + String(e.stderr ?? e.message)
      console.log(`ERROR (${((Date.now() - t0) / 1000).toFixed(1)} s)${/status 524/.test(msg) ? ' — pasó de ~2 min' : ''}`)
      // Un bloque de solo lectura (bench: termina en ROLLBACK) no deja nada a medias: se sigue con el siguiente.
      if (/ROLLBACK;\s*$/.test(c.sql)) continue
      console.error(msg)
      process.exit(1)
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`)
    // Tablas de resultados (bench, conteo final); los bloques de escritura no devuelven filas.
    if (/│/.test(out)) console.log(out.trim())
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
