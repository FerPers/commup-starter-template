import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findUnboundedFrom } from './unbounded-from'
import baseline from './unbounded-from.baseline.json'

/**
 * S09 (B-07): regla de CI contra lecturas PostgREST sin tope. Cada archivo puede tener a lo sumo
 * las lecturas «sin tope» que tenía al cerrar S09 (`unbounded-from.baseline.json`, por archivo y
 * tabla); una nueva falla aquí. Para una lectura acotada por diseño, comentar `// bounded: <razón>`.
 * Al corregir una del baseline, bajar su número (el test también falla si sobra margen, para que el
 * baseline solo se achique).
 */
const ROOT = process.cwd()

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.includes('supabase.generated') ? [full] : []
  })
}

function current(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of sources(join(ROOT, 'src'))) {
    for (const hit of findUnboundedFrom(readFileSync(file, 'utf8'))) {
      const key = `${relative(ROOT, file)}::${hit.table}`
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}

describe('lecturas sin tope (PostgREST corta en 1000 filas)', () => {
  const now = current()
  const allowed = baseline as Record<string, number>

  it('no aparecen lecturas nuevas sin .limit/.range/fetchAllRows ni `// bounded:`', () => {
    const extra = Object.entries(now)
      .filter(([k, n]) => n > (allowed[k] ?? 0))
      .map(([k, n]) => `${k} (${n} > ${allowed[k] ?? 0})`)
    expect(extra).toEqual([])
  })

  it('el baseline solo se achica (bajar el número al corregir una lectura)', () => {
    const slack = Object.entries(allowed)
      .filter(([k, n]) => (now[k] ?? 0) < n)
      .map(([k, n]) => `${k} (${now[k] ?? 0} < ${n})`)
    expect(slack).toEqual([])
  })

  it('el detector reconoce los casos típicos', () => {
    const src = [
      "a.from('itrs').select('id').eq('project_id', p)",
      "b.from('itrs').select('id').eq('project_id', p).limit(20)",
      "c.from('itrs').select('id').eq('project_id', p).limit(5000)",
      "d.from('itrs').select('id').eq('id', x).single()",
      "e.from('itr_responses').select('id').eq('itr_id', x)",
      "// bounded: catálogo por diseño\nf.from('itrs').select('id').eq('project_id', p)",
      "g.storage.from('itr-attachments').createSignedUrl(x, 60)",
    ].join('\n')
    expect(findUnboundedFrom(src).map(h => h.reason)).toEqual(['unbounded', 'limit_over_max'])
  })
})
