#!/usr/bin/env node
// A14: restaura los archivos exportados por storage-export.mjs en otro proyecto y verifica cada uno por sha256.
//   node scripts/backup/storage-import.mjs <directorio>
// Variables: STORAGE_URL y STORAGE_SERVICE_KEY del proyecto DESTINO. Crea los buckets que falten (mismo público,
// límite y tipos) y sube con upsert: si la BD ya trae las filas de storage.objects, el archivo las acompaña.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const dir = process.argv[2]
const url = process.env.STORAGE_URL, key = process.env.STORAGE_SERVICE_KEY
if (!dir || !url || !key) { console.error('uso: STORAGE_URL=… STORAGE_SERVICE_KEY=… node storage-import.mjs <directorio>'); process.exit(2) }
if (url.includes('mdyljpgzvigzjpqluket')) { console.error('storage-import: el destino es producción; restaura en un proyecto nuevo'); process.exit(2) }
const db = createClient(url, key, { auth: { persistSession: false } })
const manifest = JSON.parse(readFileSync(path.join(dir, 'storage-manifest.json'), 'utf8'))

const { data: existing } = await db.storage.listBuckets()
const have = new Set((existing ?? []).map(b => b.id))
for (const b of manifest.buckets) {
  if (have.has(b.id)) continue
  const { error } = await db.storage.createBucket(b.id, { public: b.public, fileSizeLimit: b.file_size_limit ?? undefined, allowedMimeTypes: b.allowed_mime_types ?? undefined })
  if (error) throw new Error(`bucket ${b.id}: ${error.message}`)
}
let bad = 0
for (const o of manifest.objects) {
  const bytes = readFileSync(path.join(dir, o.bucket, o.name))
  const { error } = await db.storage.from(o.bucket).upload(o.name, bytes, { upsert: true, contentType: o.content_type ?? undefined })
  if (error) { console.error(`${o.bucket}/${o.name}: ${error.message}`); bad++; continue }
  const { data: back, error: dErr } = await db.storage.from(o.bucket).download(o.name)
  const sha = back ? createHash('sha256').update(Buffer.from(await back.arrayBuffer())).digest('hex') : null
  if (dErr || sha !== o.sha256) { console.error(`${o.bucket}/${o.name}: sha256 distinto tras restaurar`); bad++ }
}
console.log(`storage: ${manifest.objects.length - bad}/${manifest.objects.length} objetos restaurados y verificados`)
process.exit(bad ? 1 : 0)
