/**
 * S09 (B-07, 2026-10-19): detector de lecturas PostgREST sin tope. Supabase corta en 1000 filas
 * sin avisar, así que una cadena `.from('x').select(…)` que no lleva `.limit/.range/.single/
 * .maybeSingle`, `head: true` ni va dentro de `fetchAllRows` puede devolver una muestra arbitraria.
 *
 * Una lectura acotada por otra razón (una fila por id, catálogo pequeño por diseño) se marca con
 * un comentario `// bounded: <razón>` en la línea anterior o en la misma línea. El test
 * `unbounded-from.test.ts` falla con cualquier cadena nueva sin tope ni razón.
 */

export type UnboundedHit = { line: number; table: string; chain: string; reason: 'unbounded' | 'limit_over_max' }

/** Tope de filas de PostgREST: un `.limit(5000)` devuelve igual 1000. */
export const POSTGREST_MAX_ROWS = 1000

const BOUNDED = [
  '.range(', '.single(', '.maybeSingle(', 'head: true', 'head:true',
  '.insert(', '.update(', '.upsert(', '.delete(',
]

/**
 * Filtros «a escala»: proyecto, org o persona pueden tener decenas de miles de filas. Una cadena
 * filtrada por cualquier otra clave (`id`, `itr_id`, `template_id`, `review_id`…) lee los hijos de
 * una entidad y se considera acotada por dominio.
 */
const SCALE_KEYS = new Set([
  'project_id', 'org_id', 'user_id', 'assigned_to', 'created_by', 'recipient_user_id', 'system_id', 'area_id',
])

/** Catálogos de configuración por org: decenas de filas por diseño, nunca miles. */
const CATALOG_TABLES = new Set([
  'organizations', 'projects', 'project_phases', 'disciplines', 'equipment_types', 'readiness_gates', 'gate_criteria',
  'api_keys', 'webhook_subscriptions', 'workflow_rules', 'companies', 'register_types', 'org_members', 'profiles',
  'push_subscriptions', 'notification_preferences', 'areas', 'systems', 'preservation_procedures',
])

function entityScoped(chain: string): boolean {
  const re = /\.(?:eq|in|match)\(\s*['"`]([a-z0-9_.]+)['"`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(chain))) {
    const key = m[1].split('.').pop() as string
    if (!SCALE_KEYS.has(key) && (key === 'id' || key.endsWith('_id'))) return true
  }
  return false
}

function limitOverMax(chain: string): boolean {
  const m = /\.limit\(\s*([0-9_]+)\s*\)/.exec(chain)
  return !!m && Number(m[1].replace(/_/g, '')) > POSTGREST_MAX_ROWS
}

/** Fin de la cadena de métodos que empieza en `start` (índice de `.from(`). */
function chainEnd(src: string, start: number): number {
  let i = start
  let depth = 0
  let quote: string | null = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i
      depth--
      if (depth === 0) {
        // ¿sigue la cadena? (espacios/saltos y luego `.`)
        let j = i + 1
        while (j < src.length && /\s/.test(src[j])) j++
        if (src[j] !== '.') return i + 1
        i = j - 1
      }
    } else if (depth === 0 && (c === ',' || c === ';')) return i
  }
  return i
}

export function findUnboundedFrom(src: string): UnboundedHit[] {
  const hits: UnboundedHit[] = []
  const re = /\.from\((['"`])([a-z0-9_]+)\1\)/g
  const lines = src.split('\n')
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    // storage.from('bucket') no es una tabla
    const before = src.slice(Math.max(0, m.index - 12), m.index)
    if (/storage\s*$/.test(before)) continue
    const chain = src.slice(m.index, chainEnd(src, m.index))
    if (!chain.includes('.select(')) continue
    if (CATALOG_TABLES.has(m[2]) && !chain.includes('.limit(')) continue
    const overMax = limitOverMax(chain)
    if (!overMax && (chain.includes('.limit(') || BOUNDED.some(b => chain.includes(b)) || entityScoped(chain))) continue
    const line = src.slice(0, m.index).split('\n').length
    const ctx = src.slice(Math.max(0, m.index - 400), m.index)
    if (/fetchAllRows[^;]*$/.test(ctx) && /=>\s*[\s\S]*$/.test(ctx)) {
      // dentro de fetchAllRows(() => …): la paginación la pone el helper
      const open = ctx.lastIndexOf('fetchAllRows')
      if (!/[;}]\s*\n/.test(ctx.slice(open))) continue
    }
    const here = lines[line - 1] ?? ''
    const prev = lines[line - 2] ?? ''
    const prev2 = lines[line - 3] ?? ''
    if (/\/\/\s*bounded:/.test(here) || /\/\/\s*bounded:/.test(prev) || /\/\/\s*bounded:/.test(prev2)) continue
    hits.push({ line, table: m[2], chain: chain.replace(/\s+/g, ' ').slice(0, 160), reason: overMax ? 'limit_over_max' : 'unbounded' })
  }
  return hits
}
