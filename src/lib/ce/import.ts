// Importación de matrices C&E con IA (fase 4 · bloque D, sesión 3; decisiones §10.20 y §10.25–10.28).
// Claude lee una hoja de Excel (como CSV) o un PDF y propone causas, efectos y cruces; una persona revisa
// en pantalla y solo al aceptar se crea la matriz (source = 'ai'). Lógica pura: esquema de salida,
// emparejado de tags con el proyecto y validación antes de guardar.

import { z } from 'zod'
import { CE_ACTIONS, CE_VOTINGS, normalizeCeCode, type CeAction, type CeVoting } from './matrix'

export const AiCeOutput = z.object({
  matrix_title: z.string().nullable().describe('Título de la matriz si el documento lo indica'),
  source_document: z.string().nullable().describe('Número o nombre del documento/plano C&E si aparece'),
  revision: z.string().nullable().describe('Revisión del documento si aparece'),
  causes: z.array(z.object({
    code: z.string().describe('Código de la causa tal como aparece (p. ej. C-01); si no tiene, numerar C-01, C-02…'),
    description: z.string(),
    tag: z.string().nullable().describe('Tag del instrumento iniciador (p. ej. PT-101), exactamente como aparece'),
    signal: z.string().nullable().describe('Tag de la señal o alarma si difiere del instrumento (p. ej. PAHH-101)'),
    condition: z.string().nullable().describe('Condición: HH, LL, H, L, falla, manual, etc.'),
    setpoint: z.string().nullable().describe('Set point con unidad, tal como aparece'),
    voting: z.enum(CE_VOTINGS).nullable(),
    uncertain: z.boolean().describe('true si la lectura de esta fila es dudosa'),
    note: z.string().nullable().describe('Motivo de la duda u observación breve'),
  })),
  effects: z.array(z.object({
    code: z.string().describe('Código del efecto (p. ej. E-01); si no tiene, numerar E-01, E-02…'),
    description: z.string(),
    tag: z.string().nullable().describe('Tag del elemento final (válvula, motor, etc.)'),
    action: z.enum(CE_ACTIONS),
    uncertain: z.boolean(),
    note: z.string().nullable(),
  })),
  links: z.array(z.object({
    cause_code: z.string(),
    effect_code: z.string(),
    delay_s: z.number().nullable().describe('Retardo en segundos si el cruce es temporizado; null si es directo'),
    uncertain: z.boolean(),
  })),
  warnings: z.array(z.string()).describe('Problemas de lectura: celdas ilegibles, marcas ambiguas, páginas sin matriz…'),
})
export type AiCeOutput = z.infer<typeof AiCeOutput>

/** Número de tag comparable: mayúsculas, sin espacios. */
/**
 * Clave de emparejamiento de tags: sin mayúsculas, espacios, guiones, puntos, barras ni «_» («pt-101», «PT 101» y
 * «PT_101» → «PT101»). S13 (F-15): = columna generada SQL `tags.tag_key`, que es por donde se busca en la BD.
 */
export const normalizeTag = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[\s_./-]+/g, '')

export type ReviewCause = {
  key: string; code: string; description: string; tag: string; tagMatched: boolean; signal: string
  condition: string; setpoint: string; voting: CeVoting | null; uncertain: boolean; note: string
}
export type ReviewEffect = {
  key: string; code: string; description: string; tag: string; tagMatched: boolean; action: CeAction; uncertain: boolean; note: string
}
export type ReviewLink = { cause: string; effect: string; delay: string; uncertain: boolean }
export type ReviewState = { causes: ReviewCause[]; effects: ReviewEffect[]; links: ReviewLink[]; warnings: string[] }

/** Propuesta de la IA → estado de revisión: tags emparejados con el proyecto, cruces por clave interna. */
export function toReview(output: AiCeOutput, projectTags: Iterable<string>): ReviewState {
  const known = new Set([...projectTags].map(normalizeTag))
  const warnings = [...output.warnings]
  const causeKey = new Map<string, string>()
  const effectKey = new Map<string, string>()
  const causes = output.causes.map((c, i) => {
    const key = `c${i}`
    causeKey.set(normalizeTag(c.code), key)
    const tag = (c.tag ?? '').trim()
    return {
      key, code: c.code.trim(), description: c.description.trim(), tag, tagMatched: !tag || known.has(normalizeTag(tag)), signal: (c.signal ?? '').trim(),
      condition: (c.condition ?? '').trim(), setpoint: (c.setpoint ?? '').trim(), voting: c.voting, uncertain: c.uncertain, note: (c.note ?? '').trim(),
    }
  })
  const effects = output.effects.map((e, i) => {
    const key = `e${i}`
    effectKey.set(normalizeTag(e.code), key)
    const tag = (e.tag ?? '').trim()
    return { key, code: e.code.trim(), description: e.description.trim(), tag, tagMatched: !tag || known.has(normalizeTag(tag)), action: e.action, uncertain: e.uncertain, note: (e.note ?? '').trim() }
  })
  const links: ReviewLink[] = []
  const seen = new Set<string>()
  for (const l of output.links) {
    const cause = causeKey.get(normalizeTag(l.cause_code))
    const effect = effectKey.get(normalizeTag(l.effect_code))
    if (!cause || !effect) { warnings.push(`Cruce ${l.cause_code} × ${l.effect_code}: la causa o el efecto no está en la lista`); continue }
    if (seen.has(`${cause}|${effect}`)) continue
    seen.add(`${cause}|${effect}`)
    links.push({ cause, effect, delay: l.delay_s === null ? '' : String(l.delay_s), uncertain: l.uncertain })
  }
  return { causes, effects, links, warnings }
}

/** Errores que impiden guardar (códigos vacíos o repetidos, descripciones vacías, retardos inválidos). */
export function reviewErrors(state: ReviewState): string[] {
  const errors: string[] = []
  const check = (kind: string, rows: Array<{ code: string; description: string }>) => {
    const seen = new Set<string>()
    for (const r of rows) {
      const code = normalizeCeCode(r.code)
      if (!code) { errors.push(`${kind}: hay un código vacío o de más de 30 caracteres`); continue }
      if (seen.has(code)) errors.push(`${kind} ${code} está repetida`)
      seen.add(code)
      if (!r.description.trim()) errors.push(`${kind} ${code}: falta la descripción`)
    }
  }
  check('Causa', state.causes)
  check('Efecto', state.effects)
  for (const l of state.links) {
    if (l.delay.trim() === '') continue
    const n = Number(l.delay.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) errors.push('Hay un retardo que no es un número de segundos ≥ 0')
  }
  if (!state.causes.length || !state.effects.length) errors.push('La matriz necesita al menos una causa y un efecto')
  return [...new Set(errors)]
}

/** Texto de la hoja para la IA: CSV recortado (las matrices grandes caben de sobra). */
export const MAX_SHEET_CHARS = 200_000
export const MAX_PDF_BYTES = 4 * 1024 * 1024
