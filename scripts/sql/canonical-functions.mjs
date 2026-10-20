#!/usr/bin/env node
/**
 * S03 (D-09/B-19/E-26/F-35, 2026-10-19): funciones SQL centrales en archivos canónicos.
 *
 * Cada archivo `supabase/functions-sql/<nombre>.sql` guarda, tal cual, lo que devuelve
 * `pg_get_functiondef` en prod (más una cabecera `-- fn: <firma>` y el `;` final). Así el cuerpo que
 * corre se lee en un solo lugar, y `tests/db/function-drift.test.ts` falla si prod y el archivo difieren.
 *
 *   node scripts/sql/canonical-functions.mjs dump [firma…]   # vuelca de prod (--linked). Sin firmas:
 *                                                           # refresca todos los archivos existentes.
 *   node scripts/sql/canonical-functions.mjs emit <nombre…>  # imprime el SQL para pegar en una migración
 *
 * Flujo para cambiar una función central: editar su archivo → `emit` a una migración nueva → probar
 * con BEGIN … ROLLBACK → aplicar → `dump` (deja el archivo exactamente como lo normaliza Postgres).
 * Nunca parchear con `replace(pg_get_functiondef(…))`: `src/lib/sql/no-anchor-patches.test.ts` lo impide.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = new URL('../../supabase/functions-sql/', import.meta.url).pathname
const HEADER = /^-- fn: (.+)$/m

function existing() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const sig = readFileSync(join(DIR, f), 'utf8').match(HEADER)?.[1]
      if (!sig) throw new Error(`${f}: falta la cabecera «-- fn: <firma>»`)
      return { file: f, sig }
    })
}

function query(sql) {
  const tmp = mkdtempSync(join(tmpdir(), 'canon-'))
  try {
    const file = join(tmp, 'q.sql')
    writeFileSync(file, sql)
    const out = execFileSync('supabase', ['db', 'query', '--linked', '-o', 'json', '-f', file], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(out)
    return Array.isArray(parsed) ? parsed : parsed.rows
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function dump(sigs) {
  const list = sigs.length ? sigs : existing().map((e) => e.sig)
  for (const s of list) if (!/^public\.[a-z0-9_]+\([a-z0-9_ ,."[\]]*\)$/i.test(s)) throw new Error(`firma inválida: ${s}`)
  const values = list.map((s) => `('${s.replace(/'/g, "''")}')`).join(',')
  // search_path vacío, igual que function_definition_md5: pg_get_functiondef califica los tipos propios
  // (public.punches) según el search_path, y el test de deriva compara ese texto exacto.
  const rows = query(
    `set search_path to '';
     select s as sig, p.proname as name, pg_catalog.pg_get_functiondef(p.oid) as def
       from (values ${values}) v(s)
       left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(v.s)`,
  )
  for (const r of rows) {
    if (!r.def) throw new Error(`no existe en prod: ${r.sig}`)
    const body = r.def.replace(/\s+$/, '')
    writeFileSync(join(DIR, `${r.name}.sql`), `-- fn: ${r.sig}\n-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.\n${body};\n`)
    console.log(`✓ ${r.name}.sql`)
  }
}

function emit(names) {
  if (!names.length) throw new Error('uso: emit <nombre…>')
  for (const n of names) {
    const text = readFileSync(join(DIR, `${n.replace(/\.sql$/, '')}.sql`), 'utf8')
    process.stdout.write(text.replace(/^(--.*\n)+/, '') + '\n')
  }
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'dump') dump(args)
else if (cmd === 'emit') emit(args)
else {
  console.error('uso: canonical-functions.mjs dump [firma…] | emit <nombre…>')
  process.exit(1)
}
