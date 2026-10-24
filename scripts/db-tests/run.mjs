#!/usr/bin/env node
// A13 (2026-10-24): lanzador de las pruebas de BD (`tests/db`) contra la Supabase LOCAL (decisión 1 del plan de salida:
// la CI ya no escribe en prod).
//   npm run test:db                 → toma URL y llaves de `supabase status`, pasa los actores de supabase/seed/00_actors.sql
//   npm run test:db -- <args>       → el resto va a vitest (p. ej. tests/db/readiness.test.ts, -t "numerador")
// Requiere `supabase start` y la semilla (`supabase db reset`). Se niega a correr si la URL no es 127.0.0.1/localhost.
import { execFileSync, spawnSync } from 'node:child_process'

function supabaseEnv() {
  if (process.env.E2E_SUPABASE_URL && process.env.E2E_ANON_KEY) {
    return { url: process.env.E2E_SUPABASE_URL, anon: process.env.E2E_ANON_KEY }
  }
  const out = execFileSync('supabase', ['status', '-o', 'env', '--agent', 'no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const env = Object.fromEntries(out.split('\n').map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]))
  return { url: env.API_URL, anon: env.ANON_KEY }
}

const sb = supabaseEnv()
let host = ''
try { host = new URL(sb.url).hostname } catch { /* vacía */ }
if (!['127.0.0.1', 'localhost'].includes(host) || !sb.anon) {
  console.error(`tests/db: Supabase no es local (${sb.url || 'sin URL'}). Corre \`supabase start\` primero; nunca contra prod.`)
  process.exit(1)
}

// Mismos ids y contraseña que supabase/seed/00_actors.sql y 90_db_tests.sql.
const password = 'E2e-commup-2026!'
const actor = email => ({ email: `${email}@e2e.commup.test`, password })
const roles = { OWNER: actor('owner'), ADMIN: actor('admin'), ARCHITECT: actor('architect'), LEADER: actor('leader'), INSPECTOR: actor('inspector'), CLIENT: actor('client') }
const env = {
  ...process.env,
  TEST_SUPABASE_URL: sb.url,
  TEST_SUPABASE_ANON_KEY: sb.anon,
  TEST_USER_A_EMAIL: roles.OWNER.email,
  TEST_USER_A_PASSWORD: password,
  TEST_USER_B_EMAIL: actor('outsider').email,
  TEST_USER_B_PASSWORD: password,
  TEST_PROJECT_A_ID: 'e2e00000-0000-4000-8000-0000000000b2',
  ...Object.fromEntries(Object.entries(roles).flatMap(([role, a]) => [[`TEST_ROLE_${role}_EMAIL`, a.email], [`TEST_ROLE_${role}_PASSWORD`, a.password]])),
}

const r = spawnSync('npx', ['vitest', 'run', '--project', 'db', ...process.argv.slice(2)], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
