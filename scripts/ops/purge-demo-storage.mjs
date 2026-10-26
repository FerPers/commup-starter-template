// 2026-10-26: borra de Storage los archivos que quedaron sin dueño tras scripts/ops/purge-demo-projects.sql
// (Storage no deja borrar por SQL). Dueño = primer segmento de la ruta (CLAUDE.md, «Storage multi-tenant»);
// en handover-packages, el paquete del segundo segmento.
// Uso: node --env-file=.env.local scripts/ops/purge-demo-storage.mjs [--apply]   (sin --apply solo lista)
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
const apply = process.argv.includes('--apply')
const db = createClient(url, key, { auth: { persistSession: false } })

const OWNERS = {
  'itr-attachments': { table: 'itrs', segment: 0 },
  'punch-attachments': { table: 'punches', segment: 0 },
  'preservation-attachments': { table: 'preservation_records', segment: 0 },
  'project-documents': { table: 'projects', segment: 0 },
  'mgmt-evidence': { table: 'projects', segment: 0 },
  'redline-photos': { table: 'projects', segment: 0 },
  'handover-packages': { table: 'handover_packages', segment: 1 },
}

async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) out.push(...await listAll(bucket, path))
      else out.push(path)
    }
    if (data.length < 1000) return out
  }
}

let total = 0
for (const [bucket, { table, segment }] of Object.entries(OWNERS)) {
  const paths = await listAll(bucket)
  const ids = [...new Set(paths.map(p => p.split('/')[segment]?.split('.')[0]).filter(Boolean))]
  const alive = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from(table).select('id').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const r of data) alive.add(r.id)
  }
  const orphans = paths.filter(p => !alive.has(p.split('/')[segment]?.split('.')[0]))
  total += orphans.length
  for (const p of orphans) console.log(`${apply ? 'borra' : 'huérfano'}  ${bucket}/${p}`)
  if (apply && orphans.length) {
    const { error } = await db.storage.from(bucket).remove(orphans)
    if (error) throw new Error(`${bucket}: ${error.message}`)
  }
}
console.log(`${total} archivo(s) ${apply ? 'borrados' : 'sin dueño (sin --apply no se borra nada)'}`)
