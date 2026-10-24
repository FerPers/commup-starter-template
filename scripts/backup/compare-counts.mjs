#!/usr/bin/env node
// A14: compara la huella del respaldo (db-counts.sql en el origen) con la de la BD restaurada.
//   node scripts/backup/compare-counts.mjs <esperado.json> <restaurado.json>
// Falla si difiere una tabla de public, auth.users, storage.objects/buckets, las funciones de public o la última
// migración. El resto de auth/storage (sesiones, tokens, tablas internas del destino) solo se informa.
import { readFileSync } from 'node:fs'

const load = f => { const j = JSON.parse(readFileSync(f, 'utf8')); return j.counts ?? j[0]?.counts ?? j.rows?.[0]?.counts ?? j }
const [want, got] = process.argv.slice(2).map(load)
const strict = t => t.startsWith('public.') || ['auth.users', 'auth.identities', 'storage.objects', 'storage.buckets'].includes(t)
const errors = [], notes = []
for (const [t, n] of Object.entries(want.tables)) {
  const m = got.tables[t]
  if (m === undefined) (strict(t) ? errors : notes).push(`${t}: falta en el destino (origen ${n})`)
  else if (Number(m) !== Number(n)) (strict(t) ? errors : notes).push(`${t}: origen ${n}, restaurado ${m}`)
}
if (Number(want.public_functions) !== Number(got.public_functions)) errors.push(`funciones de public: origen ${want.public_functions}, restaurado ${got.public_functions}`)
if (want.last_migration !== got.last_migration) errors.push(`última migración: origen ${want.last_migration}, restaurado ${got.last_migration}`)
const jobs = j => (j.cron_jobs ?? []).map(c => `${c.jobname} ${c.schedule}`).sort().join('\n')
if (jobs(want) !== jobs(got)) errors.push('jobs de pg_cron distintos')
const rows = Object.entries(want.tables).filter(([t]) => t.startsWith('public.')).reduce((s, [, n]) => s + Number(n), 0)
for (const n of notes) console.log(`  aviso: ${n}`)
for (const e of errors) console.log(`  ERROR: ${e}`)
console.log(`BD: ${Object.keys(want.tables).length} tablas, ${rows} filas en public, ${(want.cron_jobs ?? []).length} jobs de pg_cron — ${errors.length ? `${errors.length} diferencias` : 'idéntica'}`)
process.exit(errors.length ? 1 : 0)
