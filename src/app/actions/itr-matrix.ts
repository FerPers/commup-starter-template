'use server'

import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { createClaudeClient, isAiConfigured, AI_NOT_CONFIGURED, CLAUDE_MODEL } from '@/lib/ai/claude'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { textOr, textOrNull } from '@/lib/excel/normalize'

// ── Matriz "tipo de equipo × plantilla ITR" (híbrida) ───────────────────────
// La IA cura la matriz una vez por org (propone filas con motivo y confianza);
// un editor acepta o rechaza. El día a día (sugerir ITRs a un tag) es
// determinista: lee las filas aceptadas. La IA por tag queda como respaldo.
//
// Reglas fijas: la IA nunca asigna; siempre sugiere por fase (la fase va en la
// plantilla); puede cruzar disciplinas si lo justifica en el motivo; una
// decisión humana no se pisa al regenerar.

export interface MatrixRow {
  id: string
  equipment_type_id: string
  itr_template_id: string
  status: 'proposed' | 'accepted' | 'rejected'
  source: 'ai' | 'manual'
  confidence: number | null
  reason: string | null
  model: string | null
  proposed_at: string
  reviewed_at: string | null
  template: { code: string; title: string; discipline_code: string | null; phase_code: string | null }
}

type TemplateLite = {
  id: string
  code: string
  title: string
  description: string | null
  discipline_code: string | null
  phase_code: string | null
  sections: string[]
}

const MAX_TYPES_PER_CALL = 15

// ── Carga del catálogo (compacta, para el prompt) ────────────────────────────

// Contexto mínimo (estructural: lo satisface el ctx de withAuthOnly)
type Ctx = { supabase: SupabaseClient<Database>; orgId: string }

async function loadTemplates(ctx: Ctx): Promise<TemplateLite[]> {
  const { data } = await ctx.supabase
    .from('itr_templates')
    .select('id, code, title, description, disciplines(code), project_phases(code), itr_template_sections(title, order_index)')
    .eq('org_id', ctx.orgId)
    .eq('is_active', true)
    .order('code')
  type Raw = {
    id: string; code: string; title: string; description: string | null
    disciplines: { code: string } | null
    project_phases: { code: string } | null
    itr_template_sections: { title: string; order_index: number }[] | null
  }
  return ((data ?? []) as unknown as Raw[]).map(t => ({
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    discipline_code: t.disciplines?.code ?? null,
    phase_code: t.project_phases?.code ?? null,
    sections: (t.itr_template_sections ?? []).sort((a, b) => a.order_index - b.order_index).slice(0, 4).map(s => s.title),
  }))
}

function catalogText(templates: TemplateLite[]): string {
  return templates
    .map(t => {
      const desc = t.description ? ` — ${t.description.replace(/\s+/g, ' ').slice(0, 120)}` : ''
      const secs = t.sections.length ? ` | secciones: ${t.sections.join('; ')}` : ''
      return `${t.code} | ${t.title}${desc} | disciplina ${t.discipline_code ?? '?'} | fase ${t.phase_code ?? '?'}${secs}`
    })
    .join('\n')
}

const SYSTEM_RULES = `Eres un ingeniero senior de Completion & Commissioning (Oil & Gas, energía e industria). Tu tarea es decidir qué plantillas ITR (Inspection & Test Record) aplican a cada tipo de equipo, por fase.

Reglas:
- Solo puedes usar códigos de plantilla que aparezcan en el catálogo. No inventes códigos.
- Sugiere por fase: cada plantilla ya tiene su fase (A = construcción/mecánica completa, B = pre-comisionamiento, C = comisionamiento, según la organización). Para cada tipo de equipo cubre las fases que apliquen.
- Puedes cruzar disciplinas cuando el equipo lo justifique (ej.: una bomba lleva ITRs mecánicos y también los eléctricos de su motor; un transmisor lleva instrumentación y el lazo). Explica ese cruce en el motivo.
- Sé selectivo: entre 2 y 8 plantillas por tipo de equipo. Si una plantilla es dudosa, bájale la confianza en vez de omitirla.
- confidence es un número entre 0 y 1. reason es una frase corta en español (máx. 160 caracteres), concreta y verificable por un ingeniero.
- Si un tipo de equipo no tiene ninguna plantilla razonable en el catálogo, no devuelvas filas para él.`

const MatrixOutput = z.object({
  assignments: z.array(z.object({
    equipment_type_code: z.string(),
    template_code: z.string(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
})

const TagOutput = z.object({
  suggestions: z.array(z.object({
    template_code: z.string(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
})

// ── Lectura ─────────────────────────────────────────────────────────────────

export const listMatrix = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx): Promise<{ rows?: MatrixRow[]; error?: string }> => {
    const { data, error } = await ctx.supabase
      .from('equipment_type_templates')
      .select('id, equipment_type_id, itr_template_id, status, source, confidence, reason, model, proposed_at, reviewed_at, itr_templates(code, title, disciplines(code), project_phases(code))')
      .eq('org_id', ctx.orgId)
      .order('proposed_at', { ascending: false })
    if (error) return { error: error.message }
    type Raw = Omit<MatrixRow, 'template' | 'status' | 'source'> & {
      status: string; source: string
      itr_templates: { code: string; title: string; disciplines: { code: string } | null; project_phases: { code: string } | null } | null
    }
    const rows: MatrixRow[] = ((data ?? []) as unknown as Raw[]).map(r => ({
      id: r.id,
      equipment_type_id: r.equipment_type_id,
      itr_template_id: r.itr_template_id,
      status: r.status as MatrixRow['status'],
      source: r.source as MatrixRow['source'],
      confidence: r.confidence,
      reason: r.reason,
      model: r.model,
      proposed_at: r.proposed_at,
      reviewed_at: r.reviewed_at,
      template: {
        code: r.itr_templates?.code ?? '?',
        title: r.itr_templates?.title ?? '',
        discipline_code: r.itr_templates?.disciplines?.code ?? null,
        phase_code: r.itr_templates?.project_phases?.code ?? null,
      },
    }))
    return { rows }
  },
)

// ── Generación con IA (por lote de tipos; el cliente itera) ─────────────────

export interface GenerateResult {
  proposed: number
  keptHumanDecision: number
  unknownCodes: string[]
  typesWithoutProposals: string[]
}

export const generateMatrixWithAi = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, equipmentTypeIds: string[]): Promise<{ result?: GenerateResult; error?: string }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED }
    const ids = [...new Set(equipmentTypeIds)].slice(0, MAX_TYPES_PER_CALL)
    if (ids.length === 0) return { error: 'No hay tipos de equipo para procesar' }

    const [{ data: types }, { data: phases }, templates] = await Promise.all([
      ctx.supabase.from('equipment_types').select('id, code, name, category').eq('org_id', ctx.orgId).in('id', ids),
      ctx.supabase.from('project_phases').select('code, name, order_index').eq('org_id', ctx.orgId).order('order_index'),
      loadTemplates(ctx),
    ])
    if (!types?.length) return { error: 'Tipos de equipo no encontrados en la organización' }
    if (templates.length === 0) return { error: 'La organización no tiene plantillas ITR activas. Importa el catálogo primero.' }

    const client = createClaudeClient()
    const phasesText = (phases ?? []).map(p => `${p.code} = ${p.name}`).join('; ')
    const typesText = types.map(t => `${t.code} | ${t.name}${t.category ? ` | categoría ${t.category}` : ''}`).join('\n')

    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(MatrixOutput) },
      system: [
        { type: 'text', text: SYSTEM_RULES },
        // Catálogo estable → cacheado entre lotes de la misma corrida
        { type: 'text', text: `CATÁLOGO DE PLANTILLAS ITR (código | título — descripción | disciplina | fase | secciones):\n${catalogText(templates)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: `Fases de la organización: ${phasesText}\n\nTIPOS DE EQUIPO a resolver (código | nombre | categoría):\n${typesText}\n\nDevuelve las plantillas que aplican a cada tipo de equipo, por fase, con confianza y motivo.`,
      }],
    })

    if (response.stop_reason === 'refusal') return { error: 'El modelo declinó la solicitud.' }
    const parsed = response.parsed_output
    if (!parsed) return { error: 'La respuesta de la IA no pudo interpretarse. Intenta de nuevo.' }

    const typeByCode = new Map(types.map(t => [t.code.toUpperCase(), t.id]))
    const templateByCode = new Map(templates.map(t => [t.code.toUpperCase(), t.id]))

    const { data: existing } = await ctx.supabase
      .from('equipment_type_templates')
      .select('equipment_type_id, itr_template_id, status')
      .eq('org_id', ctx.orgId)
      .in('equipment_type_id', ids)
    const decided = new Set(
      (existing ?? []).filter(e => e.status !== 'proposed').map(e => `${e.equipment_type_id}|${e.itr_template_id}`),
    )

    const result: GenerateResult = { proposed: 0, keptHumanDecision: 0, unknownCodes: [], typesWithoutProposals: [] }
    const rows = new Map<string, { org_id: string; equipment_type_id: string; itr_template_id: string; status: string; source: string; confidence: number; reason: string; model: string; proposed_at: string }>()
    const typesCovered = new Set<string>()

    for (const a of parsed.assignments) {
      const typeId = typeByCode.get(a.equipment_type_code.toUpperCase())
      const templateId = templateByCode.get(a.template_code.toUpperCase())
      if (!typeId || !templateId) { result.unknownCodes.push(`${a.equipment_type_code}→${a.template_code}`); continue }
      typesCovered.add(typeId)
      const key = `${typeId}|${templateId}`
      if (decided.has(key)) { result.keptHumanDecision++; continue }
      rows.set(key, {
        org_id: ctx.orgId,
        equipment_type_id: typeId,
        itr_template_id: templateId,
        status: 'proposed',
        source: 'ai',
        confidence: Math.round(a.confidence * 100) / 100,
        reason: a.reason.slice(0, 300),
        model: response.model,
        proposed_at: new Date().toISOString(),
      })
    }

    if (rows.size > 0) {
      const { error } = await ctx.supabase
        .from('equipment_type_templates')
        .upsert([...rows.values()], { onConflict: 'org_id,equipment_type_id,itr_template_id', ignoreDuplicates: false })
      if (error) return { error: error.message }
      result.proposed = rows.size
    }
    result.typesWithoutProposals = types.filter(t => !typesCovered.has(t.id)).map(t => t.code)

    revalidatePath('/admin/templates/matrix')
    return { result }
  },
)

// ── Revisión humana ─────────────────────────────────────────────────────────

export const reviewMatrixRows = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, rowIds: string[], status: 'accepted' | 'rejected' | 'proposed'): Promise<{ error?: string; updated?: number }> => {
    const ids = [...new Set(rowIds)].slice(0, 500)
    if (ids.length === 0) return { updated: 0 }
    const { error, count } = await ctx.supabase
      .from('equipment_type_templates')
      .update({
        status,
        reviewed_by: status === 'proposed' ? null : ctx.userId,
        reviewed_at: status === 'proposed' ? null : new Date().toISOString(),
      }, { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .in('id', ids)
    if (error) return { error: error.message }
    revalidatePath('/admin/templates/matrix')
    return { updated: count ?? 0 }
  },
)

export const addMatrixRow = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: { equipmentTypeId: string; templateId: string; reason?: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('equipment_type_templates')
      .upsert({
        org_id: ctx.orgId,
        equipment_type_id: input.equipmentTypeId,
        itr_template_id: input.templateId,
        status: 'accepted',
        source: 'manual',
        confidence: null,
        reason: textOr(input.reason, 'Añadida manualmente'),
        model: null,
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'org_id,equipment_type_id,itr_template_id' })
    if (error) return { error: error.message }
    revalidatePath('/admin/templates/matrix')
    return {}
  },
)

export const deleteMatrixRow = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, rowId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('equipment_type_templates')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('id', rowId)
    if (error) return { error: error.message }
    revalidatePath('/admin/templates/matrix')
    return {}
  },
)


// ── Importación desde Excel (la "matriz mental" del usuario) ────────────────
// Filas resueltas por código de tipo y código de plantilla. Entran como
// aceptadas/manuales: son decisión humana, así que la IA no las pisa.

export interface MatrixImportRow {
  equipment_type_code: string
  template_code: string
  required?: boolean
  condition?: string
  notes?: string
}

export interface MatrixImportResult {
  imported: number
  updated: number
  skipped: number
  errors: { row: number; reason: string }[]
}

export const importMatrixRows = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, rows: MatrixImportRow[]): Promise<{ result?: MatrixImportResult; error?: string }> => {
    const result: MatrixImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] }
    const [{ data: types }, { data: templates }, { data: existing }] = await Promise.all([
      ctx.supabase.from('equipment_types').select('id, code').eq('org_id', ctx.orgId),
      ctx.supabase.from('itr_templates').select('id, code').eq('org_id', ctx.orgId),
      ctx.supabase.from('equipment_type_templates').select('equipment_type_id, itr_template_id').eq('org_id', ctx.orgId),
    ])
    const typeByCode = new Map((types ?? []).map(t => [t.code.toUpperCase(), t.id]))
    const templateByCode = new Map((templates ?? []).map(t => [t.code.toUpperCase(), t.id]))
    const existingKeys = new Set((existing ?? []).map(e => `${e.equipment_type_id}|${e.itr_template_id}`))

    const payload = new Map<string, { org_id: string; equipment_type_id: string; itr_template_id: string; status: string; source: string; confidence: null; reason: string; model: null; reviewed_by: string; reviewed_at: string }>()
    rows.forEach((r, i) => {
      const typeId = typeByCode.get(r.equipment_type_code.trim().toUpperCase())
      const templateId = templateByCode.get(r.template_code.trim().toUpperCase())
      if (!typeId) { result.errors.push({ row: i + 2, reason: `Tipo de equipo "${r.equipment_type_code}" no existe en la org` }); result.skipped++; return }
      if (!templateId) { result.errors.push({ row: i + 2, reason: `Plantilla "${r.template_code}" no existe en la org` }); result.skipped++; return }
      const key = `${typeId}|${templateId}`
      const parts = [r.required === false ? 'Opcional' : 'Obligatorio', textOrNull(r.condition), textOrNull(r.notes)].filter(Boolean)
      payload.set(key, {
        org_id: ctx.orgId, equipment_type_id: typeId, itr_template_id: templateId,
        status: 'accepted', source: 'manual', confidence: null,
        reason: `Matriz del usuario · ${parts.join(' · ')}`.slice(0, 300),
        model: null, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(),
      })
    })
    if (payload.size === 0) return { result }

    const values = [...payload.values()]
    for (let i = 0; i < values.length; i += 300) {
      const chunk = values.slice(i, i + 300)
      const { error } = await ctx.supabase
        .from('equipment_type_templates')
        .upsert(chunk, { onConflict: 'org_id,equipment_type_id,itr_template_id', ignoreDuplicates: false })
      if (error) return { error: error.message }
      for (const c of chunk) {
        if (existingKeys.has(`${c.equipment_type_id}|${c.itr_template_id}`)) result.updated++; else result.imported++
      }
    }
    revalidatePath('/admin/templates/matrix')
    return { result }
  },
)

// ── Respaldo: IA por tag (no persiste; el usuario decide qué asignar) ───────

export interface TagAiSuggestion {
  template_id: string
  template_code: string
  title: string
  phase_code: string | null
  discipline_code: string | null
  confidence: number
  reason: string
}

export const suggestItrsForTag = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, tagId: string): Promise<{ suggestions?: TagAiSuggestion[]; error?: string }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED }

    const { data: tag } = await ctx.supabase
      .from('tags')
      .select(`
        id, tag_number, description, manufacturer, model, fluid_type, mounting_typical, signal_type, sil_level, pid_drawing,
        disciplines(code, name), equipment_types(code, name, category),
        subsystems(code, name, systems(code, name)),
        projects!inner(org_id, name),
        signals(signal_tag, signal_type, service)
      `)
      .eq('id', tagId)
      .single()
    type RawTag = {
      tag_number: string; description: string; manufacturer: string | null; model: string | null
      fluid_type: string | null; mounting_typical: string | null; signal_type: string | null; sil_level: string | null; pid_drawing: string | null
      disciplines: { code: string; name: string } | null
      equipment_types: { code: string; name: string; category: string | null } | null
      subsystems: { code: string; name: string; systems: { code: string; name: string } | null } | null
      projects: { org_id: string; name: string }
      signals: { signal_tag: string; signal_type: string; service: string | null }[] | null
    }
    const t = tag as unknown as RawTag | null
    if (!t || t.projects.org_id !== ctx.orgId) return { error: 'Tag no encontrado' }

    const [{ data: phases }, templates] = await Promise.all([
      ctx.supabase.from('project_phases').select('code, name, order_index').eq('org_id', ctx.orgId).order('order_index'),
      loadTemplates(ctx),
    ])
    if (templates.length === 0) return { error: 'La organización no tiene plantillas ITR activas.' }

    const facts = [
      `Tag: ${t.tag_number}`,
      `Descripción: ${t.description}`,
      `Disciplina: ${t.disciplines?.code ?? '?'} (${t.disciplines?.name ?? ''})`,
      t.equipment_types ? `Tipo de equipo: ${t.equipment_types.code} — ${t.equipment_types.name}${t.equipment_types.category ? ` (${t.equipment_types.category})` : ''}` : 'Tipo de equipo: sin asignar',
      t.manufacturer || t.model ? `Fabricante/modelo: ${[t.manufacturer, t.model].filter(Boolean).join(' ')}` : null,
      t.fluid_type ? `Fluido: ${t.fluid_type}` : null,
      t.mounting_typical ? `Típico de montaje: ${t.mounting_typical}` : null,
      t.signal_type ? `Tipo de señal: ${t.signal_type}` : null,
      t.sil_level && t.sil_level !== 'None' ? `SIL: ${t.sil_level}` : null,
      t.pid_drawing ? `P&ID: ${t.pid_drawing}` : null,
      t.subsystems ? `Sistema/subsistema: ${t.subsystems.systems?.code ?? ''} ${t.subsystems.systems?.name ?? ''} / ${t.subsystems.code} ${t.subsystems.name}` : null,
      t.signals?.length ? `Señales asociadas: ${t.signals.slice(0, 12).map(s => `${s.signal_tag} (${s.signal_type}${s.service ? `, ${s.service}` : ''})`).join('; ')}` : null,
    ].filter(Boolean).join('\n')

    const client = createClaudeClient()
    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(TagOutput) },
      system: [
        { type: 'text', text: SYSTEM_RULES },
        { type: 'text', text: `CATÁLOGO DE PLANTILLAS ITR (código | título — descripción | disciplina | fase | secciones):\n${catalogText(templates)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: `Fases de la organización: ${(phases ?? []).map(p => `${p.code} = ${p.name}`).join('; ')}\n\nAnaliza este tag concreto y propone las plantillas ITR que le aplican, por fase (máximo 8):\n${facts}`,
      }],
    })
    if (response.stop_reason === 'refusal') return { error: 'El modelo declinó la solicitud.' }
    const parsed = response.parsed_output
    if (!parsed) return { error: 'La respuesta de la IA no pudo interpretarse. Intenta de nuevo.' }

    const byCode = new Map(templates.map(tpl => [tpl.code.toUpperCase(), tpl]))
    const seen = new Set<string>()
    const suggestions: TagAiSuggestion[] = []
    for (const s of parsed.suggestions) {
      const tpl = byCode.get(s.template_code.toUpperCase())
      if (!tpl || seen.has(tpl.id)) continue
      seen.add(tpl.id)
      suggestions.push({
        template_id: tpl.id,
        template_code: tpl.code,
        title: tpl.title,
        phase_code: tpl.phase_code,
        discipline_code: tpl.discipline_code,
        confidence: Math.round(s.confidence * 100) / 100,
        reason: s.reason.slice(0, 300),
      })
    }
    suggestions.sort((a, b) => (a.phase_code ?? '').localeCompare(b.phase_code ?? '') || b.confidence - a.confidence)
    return { suggestions }
  },
)
