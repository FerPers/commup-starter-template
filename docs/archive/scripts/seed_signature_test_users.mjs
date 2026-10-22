/**
 * Crea 2 usuarios test para el plan de pruebas de firmas digitales (sesión 10).
 * - leader-test@commup.test  → rol `leader`     (editor: puede firmar, NO admin)
 * - inspector-test@commup.test → rol `inspector` (NO editor: no debe ver botones)
 *
 * Ambos confirmados, miembros de DEMO Refinería Los Andes (org `e12c53b2-…`).
 * Idempotente: si existen, los borra y recrea.
 *
 * Uso:  node scripts/demo-data/seed_signature_test_users.mjs
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

const ORG_ID = 'e12c53b2-85fd-462f-86f3-bba318aa77ee'  // DEMO Refinería Los Andes
const PASSWORD = 'SigTest2026!'

const USERS = [
  { email: 'leader-test@commup.test',    fullName: 'Leader Test',    role: 'leader' },
  { email: 'inspector-test@commup.test', fullName: 'Inspector Test', role: 'inspector' },
]

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Listar users existentes una vez
const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })

for (const u of USERS) {
  const prior = existing?.users?.find(x => x.email === u.email)
  if (prior) {
    console.log(`→ ${u.email} existía (id=${prior.id.slice(0,8)}…), recreando…`)
    await admin.auth.admin.deleteUser(prior.id)
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  })

  if (error) {
    console.error(`✗ Error creando ${u.email}:`, error.message)
    process.exit(1)
  }

  const userId = data.user.id

  // Profile (UPSERT por si el trigger ya lo insertó)
  const { error: profErr } = await admin
    .from('profiles')
    .upsert({ id: userId, full_name: u.fullName, locale: 'es' }, { onConflict: 'id' })

  if (profErr) {
    console.error(`✗ Error upsert profile ${u.email}:`, profErr.message)
    process.exit(1)
  }

  // Org membership
  const { error: memErr } = await admin
    .from('org_members')
    .insert({ org_id: ORG_ID, user_id: userId, role: u.role })

  if (memErr) {
    console.error(`✗ Error org_members ${u.email}:`, memErr.message)
    process.exit(1)
  }

  console.log(`✓ ${u.email}  rol=${u.role}  id=${userId.slice(0,8)}…`)
}

console.log('')
console.log('Listo. Credenciales:')
console.log(`  Password (ambos): ${PASSWORD}`)
console.log(`  Org: DEMO Refinería Los Andes`)
console.log('')
console.log('Para limpiar al final:')
console.log('  node scripts/demo-data/cleanup_signature_test_users.mjs')
