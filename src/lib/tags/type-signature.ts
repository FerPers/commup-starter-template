// R3: firma de un tag sin tipo y detección gratis del tipo (antes de gastar IA).
//
// Firma = prefijo (primera racha de letras del número) + disciplina + descripción normalizada. La BD agrupa por la
// firma con `tag_number_prefix` / `tag_desc_norm` (migración 20261208120000); `tagPrefix` y `normDesc` son el mismo
// cálculo en TS (test de paridad con los mismos casos) para comparar contra los nombres del catálogo.
//
// Detección gratis, en orden: el prefijo es el código de un tipo · el prefijo aprendido (los tags ya tipados de la
// org con ese prefijo usan casi siempre el mismo tipo) · un sinónimo o el segundo segmento de los tags de muestra
// (equipos eléctricos: «PR01-UPS-AC-01» → UPS, «TRF-76029001» → T) · la descripción es el nombre de un tipo.
// Lo demás va a la IA.

import { TYPE_ALIASES, typeSegments } from '@/lib/equipment-types'

export type TypeGroup = {
  prefix: string
  discipline_id: string | null
  discipline_code: string | null
  discipline_name: string | null
  desc_norm: string
  description: string | null
  n: number
  samples: string[]
}

export type LearnedPrefix = { prefix: string; equipment_type_id: string; n: number }
export type CatalogType = { id: string; code: string; name: string; category: string | null }

export type FreeSource = 'prefix' | 'learned' | 'name'
export type FreeMatch = { source: FreeSource; typeId: string }

/** Mayoría para el prefijo aprendido: ≥ 80 % de los tags tipados con ese prefijo y al menos 3. */
export const LEARNED_SHARE = 0.8
export const LEARNED_MIN = 3

/** = SQL tag_number_prefix: primera racha de letras («10-PT-1001A» → PT). */
export function tagPrefix(tagNumber: string | null | undefined): string {
  const m = (tagNumber ?? '').match(/[A-Za-z]+/)
  return m ? m[0].toUpperCase() : ''
}

const FROM = 'áàäâãéèëêíìïîóòöôõúùüûñç'
const TO = 'aaaaaeeeeiiiiooooouuuunc'

/** = SQL tag_desc_norm: minúsculas, sin acentos, sin palabras con dígitos y sin signos; tope 120. */
export function normDesc(text: string | null | undefined): string {
  const lower = [...(text ?? '').toLowerCase()].map(c => { const i = FROM.indexOf(c); return i >= 0 ? TO[i] : c }).join('')
  const words = lower.split(/\s+/).filter(w => !/[0-9]/.test(w)).join(' ')
  return words.replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120).trim()
}

/** Clave estable de una firma (para cruzar grupos con propuestas guardadas). */
export function signatureKey(g: { prefix: string; discipline_id: string | null; desc_norm: string }): string {
  return `${g.prefix}|${g.discipline_id ?? ''}|${g.desc_norm}`
}

/** Nombre del tipo sin la aclaración entre paréntesis («Generador (GEN)» → «generador»). */
const bareName = (name: string) => normDesc(name.replace(/\([^)]*\)/g, ' '))

/** Prefijos aprendidos con mayoría clara: prefijo → tipo. */
export function learnedMap(rows: LearnedPrefix[]): Map<string, string> {
  const byPrefix = new Map<string, LearnedPrefix[]>()
  for (const r of rows) byPrefix.set(r.prefix, [...(byPrefix.get(r.prefix) ?? []), r])
  const out = new Map<string, string>()
  for (const [prefix, list] of byPrefix) {
    const total = list.reduce((s, r) => s + r.n, 0)
    const best = list.reduce((a, b) => (b.n > a.n ? b : a))
    if (best.n >= LEARNED_MIN && best.n / total >= LEARNED_SHARE) out.set(prefix, best.equipment_type_id)
  }
  return out
}

/** Tipo de la firma sin IA, o null. Un nombre que coincide con dos tipos no decide (ambiguo). */
/** Código del catálogo de la org que dan los segmentos del tag (el código mismo o su sinónimo). */
function segmentCode(tag: string, catalog: CatalogType[]): string | null {
  const codes = new Set(catalog.map(t => t.code.toUpperCase()))
  for (const seg of typeSegments(tag)) {
    if (codes.has(seg)) return seg
    const alias = TYPE_ALIASES[seg]
    if (alias && codes.has(alias)) return alias
  }
  return null
}

export function detectFree(g: Pick<TypeGroup, 'prefix' | 'desc_norm'> & { samples?: string[] }, catalog: CatalogType[], learned: Map<string, string>): FreeMatch | null {
  if (g.prefix) {
    const byCode = catalog.find(t => t.code.toUpperCase() === g.prefix)
    if (byCode) return { source: 'prefix', typeId: byCode.id }
    const lt = learned.get(g.prefix)
    if (lt && catalog.some(t => t.id === lt)) return { source: 'learned', typeId: lt }
  }
  // Sinónimo o segundo segmento: tiene que darlo el mismo código en todas las muestras del grupo.
  const codes = new Set((g.samples ?? []).map(tag => segmentCode(tag, catalog)))
  if (codes.size === 1) {
    const [code] = codes
    const t = code ? catalog.find(x => x.code.toUpperCase() === code) : undefined
    if (t) return { source: 'prefix', typeId: t.id }
  }
  if (!g.desc_norm) return null
  const exact = catalog.filter(t => normDesc(t.name) === g.desc_norm)
  if (exact.length === 1) return { source: 'name', typeId: exact[0].id }
  if (exact.length > 1) return null
  const bare = catalog.filter(t => bareName(t.name) === g.desc_norm)
  return bare.length === 1 ? { source: 'name', typeId: bare[0].id } : null
}

/** Código de un tipo nuevo: mayúsculas, letras/dígitos/guion, 1–12. */
export const NEW_TYPE_CODE = /^[A-Z][A-Z0-9_-]{0,11}$/

export function cleanTypeCode(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toUpperCase()
  return NEW_TYPE_CODE.test(c) ? c : null
}
