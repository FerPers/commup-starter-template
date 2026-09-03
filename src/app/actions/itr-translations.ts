'use server'

import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { createClaudeClient, isAiConfigured, AI_NOT_CONFIGURED, CLAUDE_MODEL } from '@/lib/ai/claude'
import { DEFAULT_ITR_GLOSSARY, parseGlossary } from '@/lib/constants/itr-glossary'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { textOrNull } from '@/lib/excel/normalize'

// ── Traducción ES del catálogo ITR (híbrida) ─────────────────────────────────
// `description` es el texto principal (normalmente EN); `description_es` es lo
// que ve el inspector en español y lo que imprime el PDF bilingüe. La IA
// propone; lo que guarda una persona queda como source = 'human', lo que se
// aplica sin revisar queda como 'ai' y se marca en la pantalla de revisión.

type Ctx = { supabase: SupabaseClient<Database>; orgId: string }

export type TranslationFlag = 'empty' | 'identical' | 'anglicism' | 'en_is_spanish' | 'not_translatable'

export interface TranslationItem {
  id: string
  item_number: string | null
  section_title: string
  order_index: number
  section_order: number
  description: string
  description_es: string | null
  source: 'human' | 'ai' | null
  flags: TranslationFlag[]
}

export interface TranslationReview {
  template: { id: string; code: string; title: string; title_es: string | null }
  items: TranslationItem[]
}

const EN_MARKERS = /\b(the|and|with|check|verify|ensure|install|installed|shall|prior|sheet|record|form|completion|all|for)\b/i
const ES_MARKERS = /\b(el|la|los|las|de|del|verificar|instalación|según|comprobar|equipo|que|con|para)\b/i
const ANGLICISMS = /\b(check ?sheet|box[- ]?up|tie[- ]?in|walkdown|setpoint|set point|megger|skid|flushing|vendor|datasheet|as[- ]built|punch ?list|lockout|tagout|gland|nameplate)\b/i

/** Texto que vale la pena traducir: tiene palabras, no es solo números/códigos. */
function isTranslatable(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(t)) return false
  return true
}

function flagsFor(description: string, es: string | null): TranslationFlag[] {
  const flags: TranslationFlag[] = []
  if (!isTranslatable(description)) { flags.push('not_translatable'); return flags }
  const esT = (es ?? '').trim()
  if (!esT) flags.push('empty')
  else if (esT === description.trim()) flags.push('identical')
  else if (ANGLICISMS.test(esT) || (EN_MARKERS.test(esT) && !ES_MARKERS.test(esT))) flags.push('anglicism')
  if (ES_MARKERS.test(description) && !EN_MARKERS.test(description)) flags.push('en_is_spanish')
  return flags
}

async function loadGlossary(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.orgId).single()
  const settings = (data?.settings as Record<string, unknown> | null) ?? {}
  const text = typeof settings.itr_glossary === 'string' && settings.itr_glossary.trim() ? settings.itr_glossary : DEFAULT_ITR_GLOSSARY
  return parseGlossary(text).map(g => `${g.en} → ${g.es}`).join('\n')
}

async function loadTemplate(ctx: Ctx, templateId: string): Promise<TranslationReview | null> {
  const { data } = await ctx.supabase
    .from('itr_templates')
    .select('id, code, title, title_es, itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, description_es_source, order_index))')
    .eq('id', templateId)
    .eq('org_id', ctx.orgId)
    .single()
  type Raw = {
    id: string; code: string; title: string; title_es: string | null
    itr_template_sections: { id: string; title: string; order_index: number; itr_template_items: { id: string; item_number: string | null; description: string; description_es: string | null; description_es_source: string | null; order_index: number }[] }[]
  }
  const t = data as unknown as Raw | null
  if (!t) return null
  const items: TranslationItem[] = []
  for (const s of [...(t.itr_template_sections ?? [])].sort((a, b) => a.order_index - b.order_index)) {
    for (const i of [...(s.itr_template_items ?? [])].sort((a, b) => a.order_index - b.order_index)) {
      items.push({
        id: i.id,
        item_number: i.item_number,
        section_title: s.title,
        order_index: i.order_index,
        section_order: s.order_index,
        description: i.description,
        description_es: i.description_es,
        source: (i.description_es_source as 'human' | 'ai' | null) ?? null,
        flags: flagsFor(i.description, i.description_es),
      })
    }
  }
  return { template: { id: t.id, code: t.code, title: t.title, title_es: t.title_es }, items }
}

const SYSTEM = `Eres traductor técnico senior de documentos de Completion & Commissioning (Oil & Gas, energía, industria) del inglés al español neutro de Latinoamérica (referencia: Colombia).

Reglas:
- Traduce instrucciones de inspección con verbo en infinitivo ("Verificar…", "Registrar…", "Comprobar…"), tono técnico, sin rodeos.
- Conserva intactos códigos de plantilla (M09B, E13A), números de ítem, tags, unidades (PSIG, kV, mm), siglas normalizadas (ITR, P&ID, PSV, ESD, SIL, DCS, PLC, UPS, MCC, VFD) y nombres de normas (API 610, IEC 60079).
- Aplica el GLOSARIO de la organización de forma obligatoria cuando aparezca el término.
- Encabezados de tabla o campos cortos ("Location:", "Circuit No.") se traducen igual de cortos ("Ubicación:", "Circuito N.°").
- No añadas explicaciones ni cambies el sentido. Longitud similar al original.
- Para el título de la plantilla, mantén la convención "TIPO DE FORMATO: Equipo" en mayúsculas iniciales, p. ej. "FORMATO DE COMPLETACIÓN DE CONSTRUCCIÓN: Bombas centrífugas".`

const Output = z.object({
  title_es: z.string().nullable(),
  items: z.array(z.object({ id: z.string(), description_es: z.string() })),
})

const ITEMS_PER_CALL = 120

async function translateWithAi(
  ctx: Ctx,
  review: TranslationReview,
  itemsToTranslate: TranslationItem[],
  translateTitle: boolean,
): Promise<{ title_es: string | null; items: Map<string, string> }> {
  const client = createClaudeClient()
  const glossary = await loadGlossary(ctx)
  const result = { title_es: null as string | null, items: new Map<string, string>() }

  for (let i = 0; i < Math.max(itemsToTranslate.length, translateTitle ? 1 : 0); i += ITEMS_PER_CALL) {
    const chunk = itemsToTranslate.slice(i, i + ITEMS_PER_CALL)
    const wantTitle = translateTitle && i === 0
    if (chunk.length === 0 && !wantTitle) break
    const lines = chunk.map(it => `${it.id} | [${it.section_title}] ${it.item_number ? `${it.item_number}. ` : ''}${it.description.replace(/\s+/g, ' ')}`).join('\n')
    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: `GLOSARIO (inglés → español, obligatorio):\n${glossary}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: `Plantilla ${review.template.code}: "${review.template.title}".\n${wantTitle ? 'Traduce el título de la plantilla (campo title_es).' : 'Devuelve title_es = null.'}\n\nTraduce cada ítem (id | [sección] texto). Devuelve el mismo id con su description_es:\n${lines || '(sin ítems)'}`,
      }],
    })
    if (response.stop_reason === 'refusal') throw new Error('El modelo declinó la solicitud.')
    const parsed = response.parsed_output
    if (!parsed) throw new Error('La respuesta de la IA no pudo interpretarse. Intenta de nuevo.')
    if (wantTitle && parsed.title_es?.trim()) result.title_es = parsed.title_es.trim()
    const valid = new Set(chunk.map(c => c.id))
    for (const it of parsed.items) {
      if (valid.has(it.id) && it.description_es.trim()) result.items.set(it.id, it.description_es.trim())
    }
  }
  return result
}

// ── Lectura para la pantalla de revisión ────────────────────────────────────

export const getTranslationReview = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ review?: TranslationReview; error?: string }> => {
    const review = await loadTemplate(ctx, templateId)
    if (!review) return { error: 'Plantilla no encontrada' }
    return { review }
  },
)

// ── Propuesta con IA (no persiste) ──────────────────────────────────────────

export const proposeTranslations = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
    mode: 'missing' | 'flagged' | 'all',
  ): Promise<{ title_es?: string | null; items?: { id: string; description_es: string }[]; error?: string }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED }
    const review = await loadTemplate(ctx, templateId)
    if (!review) return { error: 'Plantilla no encontrada' }
    const pick = (it: TranslationItem) => {
      if (it.flags.includes('not_translatable')) return false
      if (mode === 'all') return true
      if (mode === 'missing') return it.flags.includes('empty')
      return it.flags.some(f => f === 'empty' || f === 'identical' || f === 'anglicism')
    }
    const targets = review.items.filter(pick)
    const wantTitle = mode !== 'missing' || !review.template.title_es
    if (targets.length === 0 && !wantTitle) return { title_es: review.template.title_es, items: [] }
    try {
      const res = await translateWithAi(ctx, review, targets, wantTitle)
      return { title_es: res.title_es ?? review.template.title_es, items: [...res.items].map(([id, description_es]) => ({ id, description_es })) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error de IA' }
    }
  },
)

// ── Guardar (revisión humana) ───────────────────────────────────────────────

export const saveTranslations = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
    payload: { title_es?: string | null; items: { id: string; description_es: string | null; source: 'human' | 'ai' }[] },
  ): Promise<{ error?: string; saved?: number }> => {
    const { data: tpl } = await ctx.supabase.from('itr_templates').select('id').eq('id', templateId).eq('org_id', ctx.orgId).single()
    if (!tpl) return { error: 'Plantilla no encontrada' }

    if (payload.title_es !== undefined) {
      const { error } = await ctx.supabase.from('itr_templates').update({ title_es: textOrNull(payload.title_es) }).eq('id', templateId)
      if (error) return { error: error.message }
    }
    let saved = 0
    for (const it of payload.items.slice(0, 2000)) {
      const { error } = await ctx.supabase
        .from('itr_template_items')
        .update({ description_es: textOrNull(it.description_es), description_es_source: textOrNull(it.description_es) ? it.source : null })
        .eq('id', it.id)
        .eq('template_id', templateId)
      if (error) return { error: error.message, saved }
      saved++
    }
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath('/admin/templates')
    return { saved }
  },
)

// ── Lote org-wide: traducir lo que falta y aplicarlo (source = 'ai') ────────

export interface TranslationGap { id: string; code: string; title: string; missingTitle: boolean; missingItems: number }

export const listTranslationGaps = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx): Promise<{ gaps?: TranslationGap[]; error?: string }> => {
    const { data, error } = await ctx.supabase
      .from('itr_templates')
      .select('id, code, title, title_es, itr_template_items(description, description_es)')
      .eq('org_id', ctx.orgId)
      .eq('is_active', true)
      .order('code')
    if (error) return { error: error.message }
    type Raw = { id: string; code: string; title: string; title_es: string | null; itr_template_items: { description: string; description_es: string | null }[] }
    const gaps: TranslationGap[] = []
    for (const t of (data ?? []) as unknown as Raw[]) {
      const missingItems = (t.itr_template_items ?? []).filter(i => isTranslatable(i.description) && !(i.description_es ?? '').trim()).length
      const missingTitle = !t.title_es?.trim()
      if (missingItems > 0 || missingTitle) gaps.push({ id: t.id, code: t.code, title: t.title, missingTitle, missingItems })
    }
    return { gaps }
  },
)

export const translateTemplateMissing = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string; title: boolean; items: number }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED, title: false, items: 0 }
    const review = await loadTemplate(ctx, templateId)
    if (!review) return { error: 'Plantilla no encontrada', title: false, items: 0 }
    const targets = review.items.filter(it => it.flags.includes('empty') && !it.flags.includes('not_translatable'))
    const wantTitle = !review.template.title_es?.trim()
    if (targets.length === 0 && !wantTitle) return { title: false, items: 0 }
    let res: Awaited<ReturnType<typeof translateWithAi>>
    try { res = await translateWithAi(ctx, review, targets, wantTitle) }
    catch (e) { return { error: e instanceof Error ? e.message : 'Error de IA', title: false, items: 0 } }

    let titleDone = false
    if (wantTitle && res.title_es) {
      const { error } = await ctx.supabase.from('itr_templates').update({ title_es: res.title_es }).eq('id', templateId).eq('org_id', ctx.orgId)
      if (error) return { error: error.message, title: false, items: 0 }
      titleDone = true
    }
    let n = 0
    for (const [id, description_es] of res.items) {
      const { error } = await ctx.supabase
        .from('itr_template_items')
        .update({ description_es, description_es_source: 'ai' })
        .eq('id', id)
        .eq('template_id', templateId)
      if (!error) n++
    }
    revalidatePath('/admin/templates')
    revalidatePath(`/admin/templates/${templateId}`)
    return { title: titleDone, items: n }
  },
)
