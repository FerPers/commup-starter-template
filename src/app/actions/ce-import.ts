'use server'

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { aiNotConfigured, isAiConfigured, type createClaudeClient } from '@/lib/ai/claude'
import { runAi } from '@/lib/ai/run'
import { checkProjectAccess } from '@/lib/auth/access'
import { accessError } from '@/lib/i18n/action-errors'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { AiCeOutput, MAX_PDF_BYTES, MAX_SHEET_CHARS, normalizeTag, reviewErrors, splitGroupedEffects, toReview, type ReviewState } from '@/lib/ce/import'
import { normalizeCeCode, parseDelay } from '@/lib/ce/matrix'

// Importación de matrices C&E con IA (fase 4 · bloque D, sesión 3; §10.20 y §10.25–10.28). La IA
// solo PROPONE: la extracción devuelve un estado de revisión y nada se guarda hasta que una persona
// acepta en pantalla (createCeMatrixFromReview), que vuelve a validar y a emparejar los tags.

const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max) || null

const SYSTEM_RULES = `Eres un ingeniero de instrumentación y control que transcribe matrices causa-efecto (C&E) de sistemas
de paro (ESD/PSD/SIS) para comisionamiento industrial. Extrae UNA matriz del documento:
- Causas = filas (iniciadores): código, descripción, tag del instrumento, señal/alarma, condición (HH, LL, H, L, falla,
  manual…), set point con unidad y votación (1oo1, 1oo2, 2oo2, 2oo3; "other" si es otra; null si no se indica).
- Efectos = columnas (elementos finales o acciones): código, descripción, tag y acción (close, open, trip, start, stop,
  alarm, other).
- Cruces = celdas marcadas (X, •, número, letra). Si la marca indica temporización (T, retardo, "5 s"), pon delay_s en
  segundos; si no, null.
Reglas:
- Transcribe exactamente lo que dice el documento. NO inventes tags, set points ni cruces. Si un dato no aparece, null.
- Si una celda o fila es ilegible o ambigua, márcala uncertain=true y explica en note; agrega un aviso en warnings.
- Si las causas o efectos no tienen código, numéralos C-01, C-02… / E-01, E-02… en el orden del documento.
- Si el documento trae varias matrices, extrae solo la indicada por el usuario (o la primera) y avísalo en warnings.
- Responde en español en descripciones y avisos cuando el documento esté en español; si está en inglés, conserva el texto original.`

export type ExtractResult = {
  review?: ReviewState
  meta?: { title: string; sourceDocument: string; revision: string; fileName: string }
  error?: string
}

/**
 * Tags del proyecto que coinciden con los leídos sin mayúsculas, espacios, guiones, puntos, barras ni «_»
 * (S13, F-15: se busca por la columna generada `tags.tag_key`, no por variantes del texto). Una clave que
 * corresponde a más de un tag queda sin emparejar (ámbar) en lugar de elegir uno al azar.
 */
async function matchingTags(supabase: SupabaseClient<Database>, projectId: string, candidates: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(candidates.map(normalizeTag).filter(Boolean))]
  const out = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabase.from('tags').select('id, tag_key').eq('project_id', projectId).in('tag_key', keys.slice(i, i + 200))
    for (const t of data ?? []) {
      if (!t.tag_key) continue
      if (out.has(t.tag_key)) ambiguous.add(t.tag_key)
      out.set(t.tag_key, t.id)
    }
  }
  for (const k of ambiguous) out.delete(k)
  return out
}

/** FormData: projectId, fileName, hint?, y `sheet` (CSV de la hoja elegida) o `pdf` (archivo). */
export const extractCeMatrixWithAi = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, form: FormData): Promise<ExtractResult> => {
    if (!isAiConfigured()) return { error: await aiNotConfigured() }
    const t = await getTranslations('ActionErrors')
    const projectId = String(form.get('projectId') ?? '')
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }
    const fileName = String(form.get('fileName') ?? 'documento').slice(0, 200)
    const hint = String(form.get('hint') ?? '').trim().slice(0, 300)
    const sheet = form.get('sheet')
    const pdf = form.get('pdf')

    const instruction = `Archivo: ${fileName}.${hint ? ` Indicación del usuario: ${hint}.` : ''} Extrae la matriz causa-efecto.`
    let content: Parameters<ReturnType<typeof createClaudeClient>['messages']['parse']>[0]['messages'][0]['content']
    if (typeof sheet === 'string' && sheet.trim()) {
      if (sheet.length > MAX_SHEET_CHARS) return { error: t('ceImport.sheetTooLarge') }
      content = `${instruction}\n\nHoja de cálculo en CSV (separador coma; las celdas vacías son comas seguidas):\n${sheet}`
    } else if (pdf instanceof File) {
      if (pdf.type !== 'application/pdf') return { error: t('ceImport.pdfRequired') }
      if (pdf.size > MAX_PDF_BYTES) return { error: t('ceImport.pdfTooLarge', { mb: MAX_PDF_BYTES / 1024 / 1024 }) }
      const data = Buffer.from(await pdf.arrayBuffer()).toString('base64')
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
        { type: 'text', text: instruction },
      ]
    } else return { error: t('ceImport.fileRequired') }

    const run = await runAi({ orgId: ctx.orgId, userId: ctx.userId, projectId, feature: 'ce_import' }, (client, model) => client.messages.parse({
      model,
      // 20k: una hoja de GG-007 de CPF Orotoy (45 causas × 41 efectos) usó 17k; más pide streaming en el SDK.
      max_tokens: 20000,
      output_config: { effort: 'medium', format: zodOutputFormat(AiCeOutput) },
      system: SYSTEM_RULES,
      messages: [{ role: 'user', content }],
    }))
    if (!run.response) return { error: run.error }
    if (run.response.stop_reason === 'max_tokens') return { error: t('ceImport.tooLargeForOneRead') }
    const output: AiCeOutput | null = run.response.parsed_output
    if (!output) return { error: t('ceImport.aiUnparsable') }
    return reviewFromOutput(ctx.supabase, projectId, output, fileName)
  },
)

/** Propuesta (de la IA o del lector sin IA) → estado de revisión: efectos separados por equipo y tags emparejados. */
async function reviewFromOutput(supabase: SupabaseClient<Database>, projectId: string, output: AiCeOutput, fileName: string): Promise<ExtractResult> {
  const t = await getTranslations('ActionErrors')
  const parsed = splitGroupedEffects(output)
  if (!parsed.causes.length || !parsed.effects.length) return { error: parsed.warnings.length ? t('ceImport.noMatrixWithWarnings', { warnings: parsed.warnings.join(' · ') }) : t('ceImport.noMatrix') }
  const tags = await matchingTags(supabase, projectId, [...parsed.causes.map(c => c.tag ?? ''), ...parsed.effects.map(e => e.tag ?? '')])
  return {
    review: toReview(parsed, tags.keys()),
    meta: { title: parsed.matrix_title ?? '', sourceDocument: parsed.source_document ?? fileName, revision: parsed.revision ?? '', fileName },
  }
}

/**
 * Lectura SIN IA (src/lib/ce/sheet-reader.ts, en el cliente): el servidor solo valida la forma, separa efectos y
 * empareja tags. Sin costo ni cuota de IA (decisión de Luis, 2026-10-29).
 */
export const reviewCeSheetReading = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: { projectId: string; fileName: string; output: AiCeOutput }): Promise<ExtractResult> => {
    const t = await getTranslations('ActionErrors')
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, input.projectId)
    if (!access.ok) return { error: await accessError(access) }
    const parsed = AiCeOutput.safeParse(input.output)
    if (!parsed.success) return { error: t('ceImport.noMatrix') }
    const { causes, effects, links } = parsed.data
    if (causes.length > 500 || effects.length > 500 || links.length > 5000) return { error: t('ceImport.tooLarge') }
    return reviewFromOutput(ctx.supabase, input.projectId, parsed.data, String(input.fileName ?? 'documento').slice(0, 200))
  },
)

export type CreateFromReviewInput = {
  projectId: string
  systemId?: string | null
  code: string
  title: string
  revision?: string | null
  sourceDocument?: string | null
  fileName: string
  review: ReviewState
}

/** Crea la matriz revisada (source = 'ai'). Revalida y vuelve a emparejar tags: lo del cliente no se da por bueno. */
export const createCeMatrixFromReview = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'system', field: 'systemId', scopeField: 'projectId', optional: true }] },
  async (ctx, input: CreateFromReviewInput): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const code = input.code.trim().toUpperCase().slice(0, 60)
    const title = input.title.trim().slice(0, 200)
    if (!code || !title) return { error: t('ceImport.codeTitleRequired') }
    const errors = reviewErrors(input.review)
    if (errors.length) return { error: errors.slice(0, 3).join(' · ') }
    const { causes, effects, links } = input.review
    if (causes.length > 500 || effects.length > 500 || links.length > 5000) return { error: t('ceImport.tooLarge') }

    const tags = await matchingTags(ctx.supabase, input.projectId, [...causes.map(c => c.tag), ...effects.map(e => e.tag)])
    const tagId = (tag: string) => (tag.trim() ? tags.get(normalizeTag(tag)) ?? null : null)
    const notes = (parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' · ').slice(0, 1000) || null

    // S07 (F-36): matriz, causas, efectos y cruces en una sola transacción (RPC con la RLS del editor).
    const linkRows = []
    for (const l of links) {
      const cause = causes.find(c => c.key === l.cause), effect = effects.find(e => e.key === l.effect)
      if (!cause || !effect) continue
      const delay = parseDelay(l.delay)
      if ('error' in delay) return { error: delay.error }
      linkRows.push({ cause_code: normalizeCeCode(cause.code)!, effect_code: normalizeCeCode(effect.code)!, ...delay, note: l.uncertain ? 'Lectura dudosa (IA)' : null })
    }
    const { data: matrixId, error: mErr } = await ctx.supabase.rpc('create_ce_matrix_from_review', {
      p_matrix: {
        project_id: input.projectId, org_id: ctx.orgId, system_id: txt(input.systemId, 40), code, title,
        revision: txt(input.revision, 30), source_document: txt(input.sourceDocument, 200),
        notes: `Importada con IA desde «${input.fileName.slice(0, 120)}» y revisada antes de guardar.`,
      },
      p_causes: causes.map((c, i) => ({
        seq: (i + 1) * 10, code: normalizeCeCode(c.code)!, description: c.description.trim().slice(0, 300),
        tag_id: tagId(c.tag), condition: c.condition.trim().slice(0, 100) || null, setpoint: c.setpoint.trim().slice(0, 100) || null, voting: c.voting,
        notes: notes([c.signal && `Señal: ${c.signal}`, c.tag.trim() && !tagId(c.tag) && `Tag leído «${c.tag}» (no existe en el proyecto)`, c.uncertain && 'Lectura dudosa', c.note]),
      })),
      p_effects: effects.map((e, i) => ({
        seq: (i + 1) * 10, code: normalizeCeCode(e.code)!, description: e.description.trim().slice(0, 300), tag_id: tagId(e.tag), action: e.action,
        notes: notes([e.tag.trim() && !tagId(e.tag) && `Tag leído «${e.tag}» (no existe en el proyecto)`, e.uncertain && 'Lectura dudosa', e.note]),
      })),
      p_links: linkRows,
    })
    if (mErr?.code === '23505') return { error: t('ceImport.matrixExists', { code }) }
    if (mErr || !matrixId) return { error: mErr?.message ?? t('ceImport.createFailed') }
    revalidatePath(`/projects/${input.projectId}/ce-matrices`)
    return { id: matrixId as string }
  },
)
