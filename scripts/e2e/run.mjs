#!/usr/bin/env node
// G-17: lanzador de los recorridos E2E (Playwright) contra el Supabase LOCAL.
//   npm run e2e                 → toma URL y llaves de `supabase status`, compila la app con ellas y corre Playwright
//   npm run e2e -- --no-build   → reutiliza la compilación anterior (solo si ya se compiló contra el local)
//   npm run e2e -- <args>       → el resto va a `playwright test` (p. ej. --headed, -g "sin red")
//   npm run e2e -- --serve      → en vez de Playwright, sirve la compilación en :3100 (revisión en pantalla con
//                                 supabase/seed/review.sql; launch.json «local»)
// Requiere `supabase start` (y `supabase db reset` para la semilla supabase/seed/e2e.sql). Se niega a correr si la
// URL no es 127.0.0.1/localhost: estas pruebas escriben respuestas, fotos y firmas.
import { execFileSync, spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const noBuild = args.includes('--no-build')
const serve = args.includes('--serve')
const pwArgs = args.filter(a => a !== '--no-build' && a !== '--serve')

function supabaseEnv() {
  if (process.env.E2E_SUPABASE_URL && process.env.E2E_ANON_KEY && process.env.E2E_SERVICE_ROLE_KEY) {
    return { url: process.env.E2E_SUPABASE_URL, anon: process.env.E2E_ANON_KEY, service: process.env.E2E_SERVICE_ROLE_KEY }
  }
  const out = execFileSync('supabase', ['status', '-o', 'env', '--agent', 'no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const env = Object.fromEntries(out.split('\n').map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]))
  return { url: env.API_URL, anon: env.ANON_KEY, service: env.SERVICE_ROLE_KEY }
}

const sb = supabaseEnv()
let host = ''
try { host = new URL(sb.url).hostname } catch { /* vacía */ }
if (!['127.0.0.1', 'localhost'].includes(host) || !sb.anon || !sb.service) {
  console.error(`E2E: Supabase no es local (${sb.url || 'sin URL'}). Corre \`supabase start\` primero; nunca contra prod.`)
  process.exit(1)
}

// Todo lo que apunta a Supabase se pisa (Next no reemplaza variables que ya trae el proceso, así que .env.local
// con las de prod no gana). NEXT_PUBLIC_* se inyectan al compilar: por eso se compila con estas.
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: sb.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anon,
  SUPABASE_SERVICE_ROLE_KEY: sb.service,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? 'e2e',
  ANTHROPIC_API_KEY: '',
  E2E_SUPABASE_URL: sb.url,
  E2E_SERVICE_ROLE_KEY: sb.service,
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!noBuild) run('npx', ['next', 'build'])
if (serve) run('npx', ['next', 'start', '-p', String(process.env.E2E_PORT ?? 3100)])
else run('npx', ['playwright', 'test', ...pwArgs])
