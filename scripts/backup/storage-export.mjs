#!/usr/bin/env node
// A14: copia de los archivos del Storage (las copias de Supabase nunca los incluyen).
//   node scripts/backup/storage-export.mjs <directorio>
// Variables: STORAGE_URL (https://<ref>.supabase.co) y STORAGE_SERVICE_KEY (service role). Baja todos los buckets
// (públicos y privados) a <directorio>/<bucket>/<ruta> y escribe <directorio>/storage-manifest.json con tamaño y
// sha256 de cada objeto: storage-import.mjs lo usa para verificar la restauración.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const out = process.argv[2]
const url = process.env.STORAGE_URL, key = process.env.STORAGE_SERVICE_KEY
if (!out || !url || !key) { console.error('uso: STORAGE_URL=… STORAGE_SERVICE_KEY=… node storage-export.mjs <directorio>'); process.exit(2) }
const db = createClient(url, key, { auth: { persistSession: false } })

async function listAll(bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const entry of data) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) files.push(...await listAll(bucket, name)) // carpeta
      else files.push(name)
    }
    if (data.length < 1000) return files
  }
}

const { data: buckets, error } = await db.storage.listBuckets()
if (error) throw new Error(`buckets: ${error.message}`)
const manifest = { created_at: new Date().toISOString(), source: url, buckets: [], objects: [] }
for (const b of buckets) {
  manifest.buckets.push({ id: b.id, public: b.public, file_size_limit: b.file_size_limit ?? null, allowed_mime_types: b.allowed_mime_types ?? null })
  for (const name of await listAll(b.id)) {
    const { data: blob, error: dErr } = await db.storage.from(b.id).download(name)
    if (dErr) throw new Error(`${b.id}/${name}: ${dErr.message}`)
    const bytes = Buffer.from(await blob.arrayBuffer())
    const file = path.join(out, b.id, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, bytes)
    manifest.objects.push({ bucket: b.id, name, size: bytes.length, content_type: blob.type || null, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
}
writeFileSync(path.join(out, 'storage-manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`storage: ${manifest.buckets.length} buckets, ${manifest.objects.length} objetos, ${manifest.objects.reduce((n, o) => n + o.size, 0)} bytes`)
