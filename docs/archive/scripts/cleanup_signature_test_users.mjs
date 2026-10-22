/**
 * Borra los users test creados por seed_signature_test_users.mjs.
 * Cascade: org_members, profiles, certificate_signatures vía FK ON DELETE.
 *
 * Uso: node scripts/demo-data/cleanup_signature_test_users.mjs
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAILS = ['leader-test@commup.test', 'inspector-test@commup.test']

const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })

for (const email of EMAILS) {
  const u = existing?.users?.find(x => x.email === email)
  if (!u) {
    console.log(`→ ${email} no existe, skip`)
    continue
  }
  // certificate_signatures.user_id → profiles(id) ON DELETE CASCADE: firmas se borran solas
  const { error } = await admin.auth.admin.deleteUser(u.id)
  if (error) {
    console.error(`✗ Error borrando ${email}:`, error.message)
    process.exit(1)
  }
  console.log(`✓ ${email} borrado`)
}
