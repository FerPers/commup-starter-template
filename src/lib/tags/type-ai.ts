import { z } from 'zod'
import { AI_MODELS, AI_PRICES } from '@/lib/ai/pricing'
import { cleanTypeCode, type CatalogType, type TypeGroup } from './type-signature'

// R3: clasificación por firma con la IA barata (Haiku 5.5). La IA PROPONE para cada firma un tipo del catálogo, un
// tipo nuevo o nada; una persona acepta por grupo con vista previa. Aquí van el prompt, el esquema de salida y la
// conciliación con el catálogo real (códigos inventados → tipo nuevo o nada). Puro: lo usan la acción y el script
// de precisión (scripts/ai/tag-type-precision.ts).

/** Firmas por llamada (la pantalla repite hasta terminar; lo ya propuesto no se reenvía). */
export const GROUPS_PER_CALL = 150

export const TYPE_RULES = `Eres un ingeniero senior de Completion & Commissioning (Oil & Gas, energía e industria). Clasificas tags de equipos e instrumentos en el catálogo de tipos de equipo de la organización. El tipo decide qué ITR (registros de inspección y prueba) lleva cada tag.

Recibes el catálogo (código · nombre · categoría), ejemplos de prefijos ya tipados en la organización y una lista de firmas. Cada firma agrupa tags con el mismo prefijo de número, la misma disciplina y la misma descripción.

Para cada firma devuelve:
- outcome "type" y type_code = un código EXACTO del catálogo, cuando un tipo existente corresponde (aunque el prefijo sea otro: HX → HE intercambiador, PNL → tablero, VL → válvula manual). Usa la descripción, el prefijo (ISA 5.1 y prácticas de planta) y la disciplina.
- outcome "new_type" con new_code (2 a 6 letras mayúsculas, normalmente el prefijo), new_name (español, corto) y new_category (una de las categorías del catálogo), cuando el elemento es real pero ningún tipo del catálogo le sirve sin forzarlo. También para elementos que no llevan ITR propio (por ejemplo un spool que se certifica con su línea): proponles un tipo propio; dilo en reason.
- outcome "none" cuando la firma no da evidencia suficiente (descripción vacía o genérica y prefijo ambiguo).

Reglas:
- Nunca inventes un type_code: si no está en el catálogo, es "new_type".
- Si dos tipos del catálogo son sinónimos (por ejemplo PL y LINE, o FV y FCV), elige aquel cuyo código coincide con el prefijo o con los prefijos ya tipados.
- Si en "Rechazado" aparece un tipo, no lo propongas otra vez para esa firma.
- confidence entre 0 y 1: alto solo si prefijo y descripción coinciden con el tipo. reason: una frase corta en español (máx. 140 caracteres), verificable por un ingeniero.`

export const TypeClassification = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    outcome: z.enum(['type', 'new_type', 'none']),
    type_code: z.string().nullable(),
    new_code: z.string().nullable(),
    new_name: z.string().nullable(),
    new_category: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
})
export type TypeClassificationOutput = z.infer<typeof TypeClassification>

export type ClassifyGroup = TypeGroup & { rejected?: string[] }

/** Texto del pedido: catálogo, ejemplos y firmas numeradas (i = índice en `groups`). */
export function buildTypePrompt(groups: ClassifyGroup[], catalog: CatalogType[], examples: { prefix: string; code: string }[]): string {
  const cat = catalog.map(t => `${t.code} · ${t.name} · ${t.category ?? '—'}`).join('\n')
  const ex = examples.slice(0, 60).map(e => `${e.prefix} → ${e.code}`).join(', ')
  const rows = groups.map((g, i) => [
    `#${i} prefijo ${g.prefix || '—'}`,
    `disciplina ${g.discipline_code ? `${g.discipline_code} (${g.discipline_name ?? ''})` : '—'}`,
    `descripción «${(g.description ?? '').replace(/\s+/g, ' ').slice(0, 100) || '—'}»`,
    `${g.n} tags: ${g.samples.slice(0, 4).join(', ')}`,
    g.rejected?.length ? `Rechazado: ${g.rejected.join(', ')}` : null,
  ].filter(Boolean).join(' · ')).join('\n')
  return `CATÁLOGO DE TIPOS:\n${cat || '—'}\n\nPREFIJOS YA TIPADOS EN LA ORGANIZACIÓN:\n${ex || '—'}\n\nFIRMAS:\n${rows}\n\nDevuelve un ítem por firma (i = número de la firma).`
}

export type TypeProposal =
  | { outcome: 'type'; typeId: string; confidence: number; reason: string }
  | { outcome: 'new_type'; newType: { code: string; name: string; category: string | null }; confidence: number; reason: string }
  | { outcome: 'none'; confidence: number; reason: string }

/**
 * Cruza la salida con el catálogo: un type_code que no existe pasa a tipo nuevo (si trae nombre) o a nada; un tipo
 * nuevo cuyo código ya existe es ese tipo; un tipo rechazado para la firma no se propone. Índices fuera de rango o
 * repetidos se descartan.
 */
export function reconcileTypeProposals(out: TypeClassificationOutput, groups: ClassifyGroup[], catalog: CatalogType[]): Map<number, TypeProposal> {
  const byCode = new Map(catalog.map(t => [t.code.toUpperCase(), t]))
  const result = new Map<number, TypeProposal>()
  for (const it of out.items) {
    if (!Number.isInteger(it.i) || it.i < 0 || it.i >= groups.length || result.has(it.i)) continue
    const g = groups[it.i]
    const rejected = new Set((g.rejected ?? []).map(c => c.toUpperCase()))
    const confidence = Math.max(0, Math.min(1, it.confidence))
    const reason = it.reason.trim().slice(0, 200)
    const none: TypeProposal = { outcome: 'none', confidence, reason }
    const asType = (code: string | null): TypeProposal | null => {
      const t = code ? byCode.get(code.trim().toUpperCase()) : undefined
      if (!t || rejected.has(t.code.toUpperCase())) return null
      return { outcome: 'type', typeId: t.id, confidence, reason }
    }
    const asNew = (): TypeProposal | null => {
      const code = cleanTypeCode(it.new_code)
      const name = it.new_name?.trim().slice(0, 80)
      if (!code || !name) return null
      if (byCode.has(code)) return asType(code)
      if (rejected.has(code)) return null
      const category = (it.new_category ?? '').trim().slice(0, 60) || null
      return { outcome: 'new_type', newType: { code, name, category }, confidence, reason }
    }
    result.set(it.i, (it.outcome === 'type' ? asType(it.type_code) ?? asNew() : it.outcome === 'new_type' ? asNew() : null) ?? none)
  }
  return result
}

/** Costo estimado de clasificar `groups` firmas (USD, cota alta): entrada ≈ catálogo + firmas, salida ≈ 70 tokens por firma. */
export function estimateClassifyUsd(groups: number, catalogSize: number): number {
  const p = AI_PRICES[AI_MODELS.tag_types]
  const calls = Math.max(1, Math.ceil(groups / GROUPS_PER_CALL))
  const input = calls * (900 + catalogSize * 14 + 400) + groups * 45
  const output = groups * 70
  return (input * p.input + output * p.output) / 1_000_000
}
