#!/usr/bin/env node
/**
 * Aplica el DDL de schema-ddl.sql (JSON de `supabase db query -o json`) en un proyecto APARTE enlazado en <dir>
 * (`supabase link --project-ref <ref> --workdir <dir>`): borra y recrea su esquema `public` y manda las sentencias en
 * lotes; lo que falla por orden de dependencias se reintenta de a una hasta cinco pasadas. Rechaza prod.
 *
 *   node scripts/loadtest/apply-ddl.mjs /tmp/ddl.json <dir>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [ddlFile, dir] = process.argv.slice(2)
if (!ddlFile || !dir) {
  console.error('Uso: node scripts/loadtest/apply-ddl.mjs <ddl.json> <dir-enlazado>')
  process.exit(1)
}
const ref = readFileSync(join(dir, 'supabase/.temp/project-ref'), 'utf8').trim()
if (!ref || ref === 'mdyljpgzvigzjpqluket') {
  console.error('Ese directorio apunta a prod (o no está enlazado): este script borra el esquema public.')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'ddl-'))
const run = (sql) => {
  const path = join(tmp, 'batch.sql')
  writeFileSync(path, `SET check_function_bodies = off;\n${sql}`)
  try {
    execFileSync('supabase', ['db', 'query', '--linked', '--workdir', dir, '-o', 'json', '-f', path], { stdio: ['ignore', 'pipe', 'pipe'] })
    return null
  } catch (e) {
    return String(e.stdout ?? '') + String(e.stderr ?? e.message)
  }
}

try {
  const reset = run(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`)
  if (reset) throw new Error(reset)
  let pending = JSON.parse(readFileSync(ddlFile, 'utf8')).rows.map(r => r.stmt.trim().replace(/;$/, ''))
  for (let pass = 1; pass <= 5 && pending.length; pass++) {
    const size = pass === 1 ? 40 : 1
    const failed = []
    for (let i = 0; i < pending.length; i += size) {
      const batch = pending.slice(i, i + size)
      if (!run(batch.join(';\n') + ';')) continue
      for (const s of batch) {
        const err = run(s + ';')
        if (err) failed.push({ s, err })
      }
    }
    console.log(`pasada ${pass}: ${pending.length} intentadas, ${failed.length} fallan`)
    if (failed.length === pending.length) {
      for (const f of failed.slice(0, 10)) console.error(f.s.slice(0, 120), '\n  ', f.err.slice(-200))
      process.exit(1)
    }
    pending = failed.map(f => f.s)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
