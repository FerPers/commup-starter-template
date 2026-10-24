#!/usr/bin/env node
// A17: sirve la compilación local (scripts/e2e/run.mjs --no-build --serve, :3100, Supabase LOCAL) con una clave
// Ed25519 desechable para poder generar paquetes de handover al medir. Nunca la clave real: los paquetes de este
// banco no se verifican en ningún lado. launch.json «bench».
import { generateKeyPairSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const { privateKey } = generateKeyPairSync('ed25519')
const env = { ...process.env, HANDOVER_ED25519_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }
const r = spawnSync('node', ['scripts/e2e/run.mjs', '--no-build', '--serve'], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
