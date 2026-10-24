/**
 * A13 (2026-10-24): actores de las pruebas de BD. Antes cada suite hacía `describe.skipIf(!enabled)` y sin variables
 * quedaba verde sin haber corrido; ahora falla al cargar y dice qué falta. `npm run test:db` (scripts/db-tests/run.mjs)
 * las pasa todas contra la Supabase local, con los actores de supabase/seed/00_actors.sql.
 *
 * Las suites escriben (siembran y borran su jerarquía), así que solo corren contra la local. `readOnly` es para la de
 * deriva de funciones, que solo lee md5 y también corre contra prod en la CI (job «Deriva de funciones»).
 */
export type DbEnvKey =
  | 'TEST_USER_A_EMAIL' | 'TEST_USER_A_PASSWORD' | 'TEST_USER_B_EMAIL' | 'TEST_USER_B_PASSWORD' | 'TEST_PROJECT_A_ID'
  | `TEST_ROLE_${'OWNER' | 'ADMIN' | 'ARCHITECT' | 'LEADER' | 'INSPECTOR' | 'CLIENT'}_${'EMAIL' | 'PASSWORD'}`

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/

export function requireDbEnv(keys: DbEnvKey[], opts: { readOnly?: boolean } = {}): void {
  const missing = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', ...keys].filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(`tests/db: faltan ${missing.join(', ')}. Corre \`npm run test:db\` con la Supabase local (supabase start).`)
  }
  if (!opts.readOnly && !LOCAL.test(process.env.TEST_SUPABASE_URL!)) {
    throw new Error(`tests/db: esta suite escribe y solo corre contra la Supabase local, no contra ${process.env.TEST_SUPABASE_URL}`)
  }
}
