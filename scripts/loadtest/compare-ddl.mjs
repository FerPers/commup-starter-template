#!/usr/bin/env node
/**
 * Compara dos salidas de schema-ddl.sql (JSON de `supabase db query -o json`), p. ej. prod contra un proyecto
 * vacío armado con `supabase db push`: lista por tipo de objeto lo que está solo en uno y lo que difiere.
 * Sale con código 1 si hay diferencias.
 *
 *   node scripts/loadtest/compare-ddl.mjs /tmp/prod-ddl.json /tmp/repo-ddl.json [--full]
 */
import { readFileSync } from 'node:fs'

const [a, b, flag] = process.argv.slice(2)
if (!a || !b) {
  console.error('Uso: node scripts/loadtest/compare-ddl.mjs <ddl-a.json> <ddl-b.json> [--full]')
  process.exit(1)
}
const KIND = { 10: 'extensión', 20: 'tipo', 30: 'secuencia', 40: 'tabla', 41: 'columna generada', 45: 'partición', 50: 'función', 60: 'vista', 70: 'default', 80: 'pk', 81: 'unique', 82: 'check', 85: 'fk', 90: 'índice', 100: 'trigger', 101: 'trigger apagado', 110: 'rls', 120: 'política' }
const KEY = {
  40: /^CREATE TABLE public\.(\S+) \(/,
  50: /FUNCTION (public\.[^(]+\([^)]*\))/,
  60: /^CREATE VIEW public\.(\S+)/,
  70: /^ALTER TABLE public\.(\S+ ALTER COLUMN \S+)/,
  80: /^ALTER TABLE public\.(\S+ ADD CONSTRAINT \S+)/,
  81: /^ALTER TABLE public\.(\S+ ADD CONSTRAINT \S+)/,
  82: /^ALTER TABLE public\.(\S+ ADD CONSTRAINT \S+)/,
  85: /^ALTER TABLE public\.(\S+ ADD CONSTRAINT \S+)/,
  90: /^CREATE (?:UNIQUE )?INDEX (\S+)/,
  100: /^CREATE (?:CONSTRAINT )?TRIGGER (\S+ .* ON public\.\S+) /,
  120: /^CREATE POLICY (".*?"|\S+ ON public\.\S+)/,
  20: /^CREATE TYPE public\.(\S+)/,
}
const norm = (s) => s.trim().replace(/;$/, '').replace(/\s+/g, ' ')
const load = (file) => {
  const map = new Map()
  for (const r of JSON.parse(readFileSync(file, 'utf8')).rows) {
    const ord = Number(r.ord)
    const stmt = norm(r.stmt)
    map.set(`${ord}|${stmt.match(KEY[ord] ?? /^$/)?.[1] ?? stmt}`, stmt)
  }
  return map
}
const A = load(a)
const B = load(b)
const out = new Map()
const add = (ord, kind, name) => {
  const k = KIND[ord] ?? ord
  if (!out.has(k)) out.set(k, [])
  out.get(k).push(`[${kind}] ${name}`)
}
for (const k of new Set([...A.keys(), ...B.keys()])) {
  const [ord, name] = [Number(k.split('|')[0]), k.slice(k.indexOf('|') + 1)]
  if (!B.has(k)) add(ord, 'solo en A', name)
  else if (!A.has(k)) add(ord, 'solo en B', name)
  else if (A.get(k) !== B.get(k)) add(ord, 'difiere', name)
}
let total = 0
for (const [kind, items] of out) {
  total += items.length
  console.log(`## ${kind}: ${items.length}`)
  for (const i of flag === '--full' ? items : items.slice(0, 15)) console.log(`   ${i.slice(0, 240)}`)
}
console.log(total ? `${total} diferencias` : 'Sin diferencias')
process.exit(total ? 1 : 0)
