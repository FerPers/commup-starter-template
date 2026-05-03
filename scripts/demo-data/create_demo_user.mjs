/**
 * Crea un usuario demo confirmado via Supabase admin API.
 * Uso: node scripts/demo-data/create_demo_user.mjs
 * Lee SUPABASE_URL y SERVICE_ROLE_KEY desde .env.local
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'demo-glp@commup.test'
const PASSWORD = 'DemoGLP2026!'

// Si el user ya existe, lo borramos y recreamos para tener estado limpio
const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
const prior = existing?.users?.find(u => u.email === EMAIL)
if (prior) {
  console.log(`→ Usuario ${EMAIL} existía (id=${prior.id.slice(0, 8)}…), recreando…`)
  await admin.auth.admin.deleteUser(prior.id)
}

const { data, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: 'Demo GLP' },
})

if (error) {
  console.error('✗ Error creando user:', error.message)
  process.exit(1)
}

console.log('✓ Usuario demo creado:')
console.log(`  Email:    ${EMAIL}`)
console.log(`  Password: ${PASSWORD}`)
console.log(`  ID:       ${data.user.id}`)
console.log(`  Confirmed: ${data.user.email_confirmed_at ? 'sí' : 'no'}`)
