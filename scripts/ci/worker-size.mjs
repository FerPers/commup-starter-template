// G-25 (2026-10-19): presupuesto de tamaño del Worker. Cloudflare rechaza el deploy por encima de
// 10 MB comprimido (plan pago); fallamos antes, en 6 MB, para ver el crecimiento con margen.
// Uso: node scripts/ci/worker-size.mjs   (después de `opennextjs-cloudflare build`)
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const FILE = '.open-next/server-functions/default/handler.mjs'
const FAIL_MB = 6
const WARN_MB = 5

if (!existsSync(FILE)) {
  console.error(`::error::No existe ${FILE}; ¿corrió opennextjs-cloudflare build?`)
  process.exit(1)
}
const raw = readFileSync(FILE)
const gz = gzipSync(raw, { level: 9 }).length
const mb = n => (n / 1024 / 1024).toFixed(2)
const line = `Worker handler: ${mb(raw.length)} MB crudo · ${mb(gz)} MB gzip (aviso ${WARN_MB} MB, límite ${FAIL_MB} MB)`
console.log(line)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Tamaño del Worker\n\n${line}\n`)

if (gz > FAIL_MB * 1024 * 1024) {
  console.error(`::error::El handler supera ${FAIL_MB} MB gzip.`)
  process.exit(1)
}
if (gz > WARN_MB * 1024 * 1024) console.log(`::warning::El handler supera ${WARN_MB} MB gzip.`)
