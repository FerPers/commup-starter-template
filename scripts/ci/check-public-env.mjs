// G-16 (2026-10-19): las NEXT_PUBLIC_* se inyectan en el bundle al compilar. Si falta una, el build
// sale «bien» pero con el valor de respaldo (o sin la función), así que el deploy debe fallar antes.
// Uso: node scripts/ci/check-public-env.mjs   (en CI, antes de `opennextjs-cloudflare build`)
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
]
// Tienen un valor por defecto razonable o son opcionales: solo se avisa.
const OPTIONAL = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_CF_BEACON_TOKEN']

const missing = REQUIRED.filter(k => !process.env[k]?.trim())
for (const k of OPTIONAL.filter(k => !process.env[k]?.trim())) {
  console.log(`::warning::${k} no está definida; se usa el valor por defecto o se omite la función.`)
}
if (missing.length) {
  console.error(`::error::Faltan variables públicas de build: ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`OK: ${REQUIRED.length} variables públicas requeridas presentes.`)
