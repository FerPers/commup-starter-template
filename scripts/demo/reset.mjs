#!/usr/bin/env node
// A50 (2026-10-24): restablece la demo LOCAL desde cero: `supabase db reset` (baseline + migraciones + supabase/seed/*.sql)
// y el PDF del P&ID (scripts/demo/pid.mjs). Casos, actores y resultado esperado: docs/DEMO-LOCAL.md.
//   npm run demo:reset
// Se niega a correr si la Supabase del CLI no es local: el reset borra toda la BD.
import { execFileSync, spawnSync } from 'node:child_process'

const out = execFileSync('supabase', ['status', '-o', 'env', '--agent', 'no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const url = out.match(/^API_URL="?(.*?)"?$/m)?.[1] ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error(`demo:reset: Supabase no es local (${url || 'sin URL'}). Corre \`supabase start\`; nunca contra prod.`)
  process.exit(1)
}

for (const [cmd, args] of [['supabase', ['db', 'reset', '--local']], ['node', ['scripts/demo/pid.mjs']]]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
console.log('demo:reset: listo. Usuarios y casos en docs/DEMO-LOCAL.md; app con `npm run e2e -- --serve` (:3100).')
