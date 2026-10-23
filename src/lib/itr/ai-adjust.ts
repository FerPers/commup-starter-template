import { z } from 'zod'
import { AI_MODELS, AI_PRICES } from '@/lib/ai/pricing'

// R4 (plan referente; decisiones de Luis 2026-10-23): ajustes con IA por firma. La matriz aceptada da la base de cada
// tipo; Opus 5.5 ve la base de cada FIRMA (tipo + prefijo + disciplina + descripción, como R3) y propone solo agregar
// un código del catálogo dentro del alcance o excluir uno de la base, con motivo. Una persona (Líder+) acepta o
// rechaza; aceptar crea excepciones source 'ai' que nunca pisan las manuales (RPC decide_tag_itr_ai_proposal).
// Aquí van el prompt, el esquema de salida, la conciliación y el costo estimado. Puro (sin servidor).

/** Firmas por llamada: Opus razona cada una; la pantalla repite hasta terminar (lo revisado no se reenvía). */
export const SIGNATURES_PER_CALL = 15
/** Ajustes por firma como máximo (más es señal de que la base del tipo está mal: eso es la matriz). */
export const MAX_ADJUSTS_PER_SIGNATURE = 6
export const MIN_REASON = 10

export type AiProposal = {
  id: string; code: string; action: 'add' | 'exclude'; confidence: number | null; reason: string
  status: 'proposed' | 'accepted' | 'rejected'; applied_tags: number | null; skipped_tags: number | null
}

/** Una firma de `tag_ai_signatures`. */
export type AiSignature = {
  equipment_type_id: string; type_code: string; type_name: string
  prefix: string; discipline_id: string | null; discipline_code: string | null; discipline_name: string | null
  desc_norm: string; description: string | null; n: number; samples: string[]
  sil_level: string | null; fluid_type: string | null; signal_type: string | null
  base: string[]; review_state: 'pending' | 'stale' | 'reviewed'; proposals: AiProposal[]; open: number
}

export type AiSignaturePage = {
  groups_total: number; tags_total: number; pending: number; stale: number; reviewed: number; open_proposals: number
  no_rules: { groups: number; tags: number }; filtered: number; groups: AiSignature[]
}

/** Plantilla candidata (activa, de una disciplina del alcance, no generada desde lazo o C&E). */
export type CandidateTemplate = { code: string; title: string; discipline: string | null; phase: string | null }

export const ADJUST_RULES = `Eres un ingeniero senior de Completion & Commissioning (Oil & Gas, energía e industria). Revisas los ITR (registros de inspección y prueba) requeridos de grupos de tags.

Cada grupo es una FIRMA: tags con el mismo tipo de equipo, prefijo, disciplina y descripción. Su BASE son los códigos que la matriz de la organización ya exige para ese tipo. Tu trabajo es AJUSTAR esa base para este grupo concreto, no rehacerla:
- "add": un código del catálogo que este grupo necesita y la base no tiene (por ejemplo, la prueba de lazo de un transmisor que va al SIS, el ITR eléctrico del motor de una bomba si el tipo no lo trae, la calibración de un instrumento de medición fiscal).
- "exclude": un código de la base que no aplica a este grupo (por ejemplo, el tubing de instrumentos en una válvula manual, la prueba de alineación en una bomba de acople cerrado).

Reglas:
- Usa solo códigos del catálogo recibido. No inventes códigos. Un "add" nunca repite un código de la base; un "exclude" siempre es de la base.
- Basa cada ajuste en la descripción, el prefijo, la disciplina y los atributos (SIL, fluido, tipo de señal). Si la evidencia no alcanza, no propongas: la base de la matriz ya es la respuesta por defecto.
- La mayoría de los grupos no necesitan ajustes: devuelve listas vacías cuando la base es correcta.
- Respeta las cadenas por etapa (A construcción → B pre-comisionamiento → C comisionamiento): si agregas o excluyes un eslabón, revisa si su cadena queda coherente.
- Si en "Rechazado" aparece un código, no lo propongas otra vez con la misma acción.
- Máximo ${MAX_ADJUSTS_PER_SIGNATURE} ajustes por grupo. confidence entre 0 y 1. reason: una frase en español (entre 20 y 160 caracteres), concreta y verificable por un ingeniero.`

const Adjust = z.object({ code: z.string(), confidence: z.number().min(0).max(1), reason: z.string() })
export const AdjustOutput = z.object({
  items: z.array(z.object({ i: z.number().int(), add: z.array(Adjust), exclude: z.array(Adjust) })),
})
export type AdjustOutputT = z.infer<typeof AdjustOutput>

/** Catálogo compacto para el prompt (va en el bloque cacheado del sistema). */
export function catalogPrompt(templates: CandidateTemplate[]): string {
  return templates.map(t => `${t.code} | ${t.title.replace(/\s+/g, ' ').slice(0, 90)} | disciplina ${t.discipline ?? '?'} | fase ${t.phase ?? '?'}`).join('\n')
}

const rejectedOf = (g: AiSignature) => g.proposals.filter(p => p.status === 'rejected').map(p => `${p.action === 'add' ? '+' : '−'}${p.code}`)

/** Firmas numeradas (i = índice en `groups`). */
export function buildAdjustPrompt(groups: AiSignature[]): string {
  const rows = groups.map((g, i) => {
    const attrs = [
      g.sil_level && g.sil_level !== 'None' ? `SIL ${g.sil_level}` : null,
      g.fluid_type ? `fluido ${g.fluid_type}` : null,
      g.signal_type ? `señal ${g.signal_type}` : null,
    ].filter(Boolean).join(', ')
    const rejected = rejectedOf(g)
    return [
      `#${i} tipo ${g.type_code} (${g.type_name})`,
      `prefijo ${g.prefix || '—'}`,
      `disciplina ${g.discipline_code ?? '—'}`,
      `«${(g.description ?? '').replace(/\s+/g, ' ').slice(0, 100) || '—'}»`,
      `${g.n} tags (${g.samples.slice(0, 3).join(', ')})`,
      attrs || null,
      `base: ${g.base.join(', ')}`,
      rejected.length ? `Rechazado: ${rejected.join(', ')}` : null,
    ].filter(Boolean).join(' · ')
  }).join('\n')
  return `FIRMAS:\n${rows}\n\nDevuelve un ítem por firma (i = número de la firma), con add y exclude (vacíos si la base es correcta).`
}

export type AdjustProposal = { code: string; action: 'add' | 'exclude'; confidence: number; reason: string }

/**
 * Concilia la salida: «add» solo de candidatas fuera de la base; «exclude» solo de la base; sin repetir lo rechazado;
 * motivo de al menos MIN_REASON; tope por firma. Índices fuera de rango o repetidos se descartan.
 */
export function reconcileAdjust(out: AdjustOutputT, groups: AiSignature[], candidates: ReadonlySet<string>): Map<number, AdjustProposal[]> {
  const result = new Map<number, AdjustProposal[]>()
  for (const it of out.items) {
    if (!Number.isInteger(it.i) || it.i < 0 || it.i >= groups.length || result.has(it.i)) continue
    const g = groups[it.i]
    const base = new Set(g.base.map(c => c.toUpperCase()))
    const rejected = new Set(g.proposals.filter(p => p.status === 'rejected').map(p => `${p.action}|${p.code.toUpperCase()}`))
    const seen = new Set<string>()
    const list: AdjustProposal[] = []
    const take = (action: 'add' | 'exclude', a: { code: string; confidence: number; reason: string }) => {
      const code = a.code.trim().toUpperCase()
      const reason = a.reason.trim().slice(0, 300)
      if (!code || seen.has(code) || rejected.has(`${action}|${code}`) || reason.length < MIN_REASON) return
      if (action === 'add' ? base.has(code) || !candidates.has(code) : !base.has(code)) return
      seen.add(code)
      list.push({ code, action, confidence: Math.max(0, Math.min(1, a.confidence)), reason })
    }
    it.add.forEach(a => take('add', a))
    it.exclude.forEach(a => take('exclude', a))
    result.set(it.i, list.slice(0, MAX_ADJUSTS_PER_SIGNATURE))
  }
  return result
}

/**
 * Costo estimado (USD, cota alta) de revisar `signatures` firmas con Opus: el catálogo se escribe en caché una vez y
 * se lee en cada llamada; por firma ≈ 90 tokens de entrada y ≈ 600 de salida (incluye el razonamiento).
 */
export function estimateAdjustUsd(signatures: number, catalogChars: number): number {
  if (signatures <= 0) return 0
  const p = AI_PRICES[AI_MODELS.itr_adjust]
  const calls = Math.ceil(signatures / SIGNATURES_PER_CALL)
  const catalog = catalogChars / 3.5 + 1200
  const input = signatures * 90 + calls * 300
  const output = signatures * 600
  return (catalog * p.cacheWrite + (calls - 1) * catalog * p.cacheRead + input * p.input + output * p.output) / 1_000_000
}
