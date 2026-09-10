'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase.generated'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'
import { validateOptionOutcomes } from '@/lib/itr/selection-outcome'
import { parseTableConfig, type TableConfig } from '@/lib/itr/table'
import { detectItrPhase } from '@/lib/utils'
import type { Enums } from '@/types/supabase.generated'

const TIPO_ESPECIAL = 'Especial / Matriz'

// ── Templates ──────────────────────────────────────────────────

export const createTemplate = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'phase', field: 'phase_id' },
      { resource: 'discipline', field: 'discipline_id' },
    ],
  },
  async (
    ctx,
    data: {
      code: string
      title: string
      description?: string
      phase_id: string
      discipline_id: string
    },
  ): Promise<{ id?: string; error?: string }> => {
    const { data: t, error } = await ctx.supabase
      .from('itr_templates')
      .insert({ ...data, org_id: ctx.orgId })
      .select('id')
      .single()

    if (error) return { error: error.message }
    revalidatePath('/admin/templates')
    return { id: t.id }
  },
)

export const updateTemplateHeader = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
    data: { code?: string; title?: string; description?: string | null; is_active?: boolean },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_templates')
      .update(data)
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath('/admin/templates')
    return {}
  },
)

export const deleteTemplate = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_templates')
      .delete()
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/templates')
    return {}
  },
)

// ── Sections ───────────────────────────────────────────────────

export const createSection = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
    title: string,
    orderIndex: number,
  ): Promise<{ id?: string; error?: string }> => {
    const { data: s, error } = await ctx.supabase
      .from('itr_template_sections')
      .insert({ template_id: templateId, title, order_index: orderIndex })
      .select('id')
      .single()

    if (error) return { error: error.message }
    return { id: s.id }
  },
)

export const updateSection = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, sectionId: string, title: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_template_sections')
      .update({ title })
      .eq('id', sectionId)

    if (error) return { error: error.message }
    return {}
  },
)

export const deleteSection = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, sectionId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_template_sections')
      .delete()
      .eq('id', sectionId)

    if (error) return { error: error.message }
    return {}
  },
)

export const reorderSections = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    updates: { id: string; order_index: number }[],
  ): Promise<{ error?: string }> => {
    await Promise.all(updates.map(u =>
      ctx.supabase.from('itr_template_sections').update({ order_index: u.order_index }).eq('id', u.id)
    ))
    return {}
  },
)

// ── Items ──────────────────────────────────────────────────────

export interface ItemPayload {
  item_number?: string | null
  description: string
  description_es?: string | null
  item_type: Enums<'itr_item_type'>
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_document?: boolean
  requires_measurement: boolean
  unit?: string | null
  acceptance_min?: number | null
  acceptance_max?: number | null
  acceptance_text?: string | null
  /** string[] para listas; TableConfig para tablas de registro; null en el resto. */
  options?: string[] | TableConfig | null
  option_outcomes?: Record<string, 'pass' | 'fail' | 'not_applicable'>
  order_index: number
  condition_item_id?: string | null
  condition_value?: string | null
}

function selectItemMissingOptions(data: Partial<ItemPayload>): boolean {
  return data.item_type === 'select' && !(Array.isArray(data.options) && data.options.length > 0)
}

export const createItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sectionId: string,
    templateId: string,
    data: ItemPayload,
  ): Promise<{ id?: string; error?: string }> => {
    if (selectItemMissingOptions(data)) return { error: 'Un ítem de tipo lista requiere al menos una opción' }
    if (data.item_type === 'table' && !parseTableConfig(data.options)) return { error: 'La tabla requiere columnas y filas válidas' }
    if (!validateOptionOutcomes(data.options ?? null, data.option_outcomes ?? {})) return { error: 'Los resultados deben corresponder a opciones existentes y válidas' }
    if (data.item_type !== 'select' && Object.keys(data.option_outcomes ?? {}).length) return { error: 'Solo las listas admiten resultados por opción' }
    const { data: item, error } = await ctx.supabase
      .from('itr_template_items')
      .insert({ ...data, options: (data.options ?? null) as Json, section_id: sectionId, template_id: templateId })
      .select('id')
      .single()

    if (error) return { error: error.message }
    return { id: item.id }
  },
)

export const updateItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, itemId: string, data: Partial<ItemPayload>): Promise<{ error?: string }> => {
    const { data: current, error: readError } = await ctx.supabase.from('itr_template_items')
      .select('item_type, options, option_outcomes').eq('id', itemId).single()
    if (readError || !current) return { error: 'Ítem no encontrado o sin acceso' }
    const merged = { ...current, ...data }
    if (merged.item_type === 'select' && !(Array.isArray(merged.options) && merged.options.length)) return { error: 'Un ítem de tipo lista requiere al menos una opción' }
    if (merged.item_type === 'table' && !parseTableConfig(merged.options)) return { error: 'La tabla requiere columnas y filas válidas' }
    const outcomes = data.option_outcomes ?? current.option_outcomes ?? {}
    if (!validateOptionOutcomes(merged.options, outcomes)) return { error: 'Los resultados deben corresponder a opciones existentes y válidas' }
    if (merged.item_type !== 'select' && Object.keys(outcomes).length) return { error: 'Solo las listas admiten resultados por opción' }
    const { error } = await ctx.supabase
      .from('itr_template_items')
      .update({ ...data, ...('options' in data ? { options: (data.options ?? null) as Json } : {}) })
      .eq('id', itemId)

    if (error) return { error: error.message }
    return {}
  },
)

export const deleteItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, itemId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_template_items')
      .delete()
      .eq('id', itemId)

    if (error) return { error: error.message }
    return {}
  },
)

export const reorderItems = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    updates: { id: string; order_index: number }[],
  ): Promise<{ error?: string }> => {
    await Promise.all(updates.map(u =>
      ctx.supabase.from('itr_template_items').update({ order_index: u.order_index }).eq('id', u.id)
    ))
    return {}
  },
)

// ── Template revisions (atomic RPCs) ─────────────────────────────
//
// Una revisión nunca se modifica en sitio una vez activada: crear revisión
// copia la plantilla completa como borrador inactivo (version = max+1) y
// activar revisión la vuelve vigente, desactiva las demás del mismo código y
// re-apunta la matriz equipo×ITR, todo en una transacción SQL
// (migración 20260909230000).

export const createTemplateRevision = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ newTemplateId?: string; error?: string }> => {
    const { data: tpl } = await ctx.supabase
      .from('itr_templates').select('id').eq('id', templateId).eq('org_id', ctx.orgId).maybeSingle()
    if (!tpl) return { error: 'Template no encontrado' }
    const { data, error } = await ctx.supabase.rpc('create_itr_template_revision', { p_template_id: templateId })
    if (error || !data) return { error: error?.message ?? 'No se pudo crear la revisión' }
    revalidatePath('/admin/templates')
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath(`/admin/templates/${data}`)
    return { newTemplateId: data }
  },
)

export const activateTemplateRevision = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ version?: number; deactivated?: number; matrixRepointed?: number; error?: string }> => {
    const { data: tpl } = await ctx.supabase
      .from('itr_templates')
      .select('id, itr_template_items(id, item_number, description, item_type, options)')
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .maybeSingle()
    if (!tpl) return { error: 'Template no encontrado' }
    if (tpl.itr_template_items.length === 0) return { error: 'La revisión no tiene ítems' }
    // Un select sin opciones deja el ITR de campo sin poder completarse — no activable
    const badSelects = tpl.itr_template_items
      .filter(it => it.item_type === 'select' && !(Array.isArray(it.options) && it.options.length > 0))
    if (badSelects.length > 0) {
      const names = badSelects.map(it => it.item_number ?? it.description.slice(0, 40)).join(', ')
      return { error: `Ítems de tipo lista sin opciones (agrega opciones antes de activar): ${names}` }
    }
    const { data, error } = await ctx.supabase.rpc('activate_itr_template_revision', { p_template_id: templateId })
    if (error || !data) return { error: error?.message ?? 'No se pudo activar la revisión' }
    const result = data as { version?: number; deactivated?: string[]; matrix_repointed?: number }
    revalidatePath('/admin/templates')
    revalidatePath(`/admin/templates/${templateId}`)
    for (const id of result.deactivated ?? []) revalidatePath(`/admin/templates/${id}`)
    return { version: result.version, deactivated: result.deactivated?.length ?? 0, matrixRepointed: result.matrix_repointed ?? 0 }
  },
)

// ── Bulk import from Excel ─────────────────────────────────────

export interface ImportSection {
  title: string
  items: Array<{
    item_number: string | null
    description: string
    description_es: string | null
    item_type: Enums<'itr_item_type'>
    is_critical: boolean
    is_required: boolean
    requires_photo: boolean
    unit: string | null
    acceptance_min: number | null
    acceptance_max: number | null
  }>
}

export const importTemplateItems = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
    sections: ImportSection[],
    replace: boolean,
  ): Promise<{ error?: string; sectionsCreated?: number; itemsCreated?: number }> => {
    // Verify template belongs to org
    const { data: template } = await ctx.supabase
      .from('itr_templates')
      .select('id')
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .single()

    if (!template) return { error: 'Template no encontrado', sectionsCreated: 0, itemsCreated: 0 }

    // Replace: delete all existing sections (CASCADE removes items)
    if (replace) {
      const { error } = await ctx.supabase
        .from('itr_template_sections')
        .delete()
        .eq('template_id', templateId)
      if (error) return { error: error.message, sectionsCreated: 0, itemsCreated: 0 }
    }

    // If appending, find the current max section order_index
    let sectionOffset = 0
    if (!replace) {
      const { data: existing } = await ctx.supabase
        .from('itr_template_sections')
        .select('order_index')
        .eq('template_id', templateId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing) sectionOffset = existing.order_index + 1
    }

    let sectionsCreated = 0
    let itemsCreated = 0

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx]

      const { data: newSection, error: secErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: templateId, title: sec.title, order_index: sectionOffset + sIdx })
        .select('id')
        .single()

      if (secErr || !newSection) continue
      sectionsCreated++

      if (sec.items.length > 0) {
        const rows = sec.items.map((item, iIdx) => ({
          section_id: newSection.id,
          template_id: templateId,
          item_number: item.item_number,
          description: item.description,
          description_es: item.description_es,
          item_type: item.item_type,
          is_critical: item.is_critical,
          is_required: item.is_required,
          requires_photo: item.requires_photo,
          requires_measurement: item.item_type === 'measurement',
          unit: item.unit,
          acceptance_min: item.acceptance_min,
          acceptance_max: item.acceptance_max,
          order_index: iIdx,
        }))

        const { error: itemErr } = await ctx.supabase
          .from('itr_template_items')
          .insert(rows)

        if (!itemErr) itemsCreated += sec.items.length
      }
    }

    revalidatePath(`/admin/templates/${templateId}`)
    return { sectionsCreated, itemsCreated }
  },
)

// ── Bulk import from catalog (all templates at once) ───────────

export interface CatalogRow {
  code: string        // Codigo_ITR  e.g. "E10A"
  discLetter: string  // Disciplina  e.g. "E"
  tipo: string        // Tipo_Item   "Paso Estándar" | "Especial / Matriz"
  itemNo: string      // Item_No     e.g. "1.0", "10.0a", "-"
  description: string // Descripcion_Inspeccion (bilingual, combined)
}

// type (no interface): los aliases tienen index signature implícita — requisito
// del constraint ActionResult del wrapper
export type BulkImportResult = {
  templatesCreated?: number
  templatesSkipped?: number
  itemsCreated?: number
  errors?: string[]
  error?: string
}

export const bulkImportCatalog = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    rows: CatalogRow[],
    disciplineMap: Record<string, string>, // discLetter → discipline_id
    phaseMap: Record<string, string>,      // 'A' | 'B' | 'C' → phase_id
  ): Promise<BulkImportResult> => {
    // Group rows by code
    const groups = new Map<string, CatalogRow[]>()
    for (const row of rows) {
      if (!row.code || !row.description) continue
      if (!groups.has(row.code)) groups.set(row.code, [])
      groups.get(row.code)!.push(row)
    }

    // Get existing template codes to skip duplicates
    const { data: existing } = await ctx.supabase
      .from('itr_templates')
      .select('code')
      .eq('org_id', ctx.orgId)
    const existingCodes = new Set((existing ?? []).map(t => t.code))

    const result = { templatesCreated: 0, templatesSkipped: 0, itemsCreated: 0, errors: [] as string[] }

    // Separate codes into skipped vs to-process
    const toProcess: Array<{ code: string; codeRows: CatalogRow[]; disciplineId: string; phaseId: string }> = []

    for (const [code, codeRows] of groups) {
      if (existingCodes.has(code)) { result.templatesSkipped++; continue }

      const discLetter = codeRows[0].discLetter.toUpperCase()
      const phase = detectItrPhase(code)
      const disciplineId = disciplineMap[discLetter]
      const phaseId = phaseMap[phase]

      if (!disciplineId) {
        result.errors.push(`${code}: disciplina "${discLetter}" sin mapeo — omitido`)
        result.templatesSkipped++
        continue
      }
      if (!phaseId) {
        result.errors.push(`${code}: fase "${phase}" sin mapeo — omitido`)
        result.templatesSkipped++
        continue
      }
      toProcess.push({ code, codeRows, disciplineId, phaseId })
    }

    // Process all templates in parallel (each template needs 3 sequential steps internally)
    const outcomes = await Promise.all(toProcess.map(async ({ code, codeRows, disciplineId, phaseId }) => {
      const { data: template, error: tErr } = await ctx.supabase
        .from('itr_templates')
        .insert({ org_id: ctx.orgId, code, title: code, discipline_id: disciplineId, phase_id: phaseId, is_active: true, is_global: false })
        .select('id')
        .single()

      if (tErr || !template) return { ok: false, error: `${code}: ${tErr?.message ?? 'error al crear template'}`, count: 0 }

      const { data: section, error: sErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: template.id, title: 'Ítems de Inspección', order_index: 0 })
        .select('id')
        .single()

      if (sErr || !section) return { ok: false, error: `${code}: error al crear sección`, count: 0 }

      const itemRows = codeRows.map((row, idx) => ({
        section_id: section.id,
        template_id: template.id,
        item_number: row.itemNo === '-' ? null : (row.itemNo || null),
        description: row.description,
        description_es: null,
        item_type: row.tipo === TIPO_ESPECIAL ? ('text' as const) : ('checkbox' as const),
        is_required: true,
        is_critical: false,
        requires_photo: false,
        requires_measurement: false,
        order_index: idx,
      }))

      const { error: iErr } = await ctx.supabase.from('itr_template_items').insert(itemRows)
      if (iErr) return { ok: false, error: `${code}: error al insertar ítems — ${iErr.message}`, count: 0 }
      return { ok: true, error: null, count: itemRows.length }
    }))

    for (const o of outcomes) {
      if (o.ok) { result.templatesCreated++; result.itemsCreated += o.count }
      else if (o.error) result.errors.push(o.error)
    }

    revalidatePath('/admin/templates')
    return result
  },
)

// ── Cross-org template sharing ─────────────────────────────────
//
// Strategy: clone (not share). When importing from another org we duplicate
// the template into the active org so each org owns its evolution. Disciplines
// and phases are matched by code in the target org — if no match, the import
// fails and asks the user to create them first.

export type ImportableTemplate = {
  id: string
  code: string
  title: string
  version: number
  disciplineCode: string | null
  phaseCode: string | null
  sourceOrgId: string
  sourceOrgName: string
  sourceOrgIsCatalog: boolean
  sectionCount: number
  itemCount: number
  /** Revisión activa del mismo código en la org activa (null si no existe). */
  localVersion: number | null
  /** missing: no existe · current: ya se importó esta revisión · outdated: existe pero de otra revisión. */
  localState: 'missing' | 'current' | 'outdated'
}

export const listImportableTemplates = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx): Promise<{ templates?: ImportableTemplate[]; error?: string }> => {
    // RLS now exposes member orgs ∪ catalog orgs. Query org metadata once,
    // exclude the active org, and use that as the universe of source orgs.
    const { data: orgs } = await ctx.supabase
      .from('organizations')
      .select('id, name, settings')
      .neq('id', ctx.orgId)

    const orgInfo = new Map<string, { name: string; isCatalog: boolean }>()
    for (const o of orgs ?? []) {
      const settings = (o.settings as Record<string, unknown> | null) ?? {}
      orgInfo.set(o.id as string, {
        name: o.name as string,
        isCatalog: !!settings.is_template_catalog,
      })
    }

    const otherOrgIds = [...orgInfo.keys()]
    if (otherOrgIds.length === 0) return { templates: [] }

    const { data, error } = await ctx.supabase
      .from('itr_templates')
      .select(`
        id, code, title, version, org_id,
        disciplines(code),
        project_phases(code),
        itr_template_sections(id, itr_template_items(id))
      `)
      .in('org_id', otherOrgIds)
      .eq('is_active', true)
      .order('code')

    if (error) return { templates: [], error: error.message }

    // Estado local por código: qué revisión está activa y de qué revisiones
    // origen se importó ya (procedencia), para ofrecer «importar», «nueva
    // revisión» o «al día» sin volver a clonar.
    const { data: local } = await ctx.supabase
      .from('itr_templates')
      .select('code, version, is_active, source_template_id')
      .eq('org_id', ctx.orgId)
    const localByCode = new Map<string, { activeVersion: number | null; sources: Set<string> }>()
    for (const row of local ?? []) {
      const entry = localByCode.get(row.code) ?? { activeVersion: null, sources: new Set<string>() }
      if (row.is_active) entry.activeVersion = row.version
      if (row.source_template_id) entry.sources.add(row.source_template_id)
      localByCode.set(row.code, entry)
    }

    const templates: ImportableTemplate[] = (data ?? []).map(t => {
      const disc = t.disciplines as { code: string } | { code: string }[] | null
      const phase = t.project_phases as { code: string } | { code: string }[] | null
      const sections = (t.itr_template_sections ?? []) as Array<{ id: string; itr_template_items: { id: string }[] }>
      const info = orgInfo.get(t.org_id as string)
      const mine = localByCode.get(t.code as string)
      return {
        id: t.id as string,
        code: t.code as string,
        title: t.title as string,
        version: t.version as number,
        disciplineCode: Array.isArray(disc) ? disc[0]?.code ?? null : disc?.code ?? null,
        phaseCode: Array.isArray(phase) ? phase[0]?.code ?? null : phase?.code ?? null,
        sourceOrgId: t.org_id as string,
        sourceOrgName: info?.name ?? '—',
        sourceOrgIsCatalog: info?.isCatalog ?? false,
        sectionCount: sections.length,
        itemCount: sections.reduce((sum, s) => sum + s.itr_template_items.length, 0),
        localVersion: mine?.activeVersion ?? null,
        localState: !mine ? 'missing' : mine.sources.has(t.id as string) ? 'current' : 'outdated',
      }
    })

    return { templates }
  },
)

// Contexto mínimo que necesita la clonación (estructural: lo satisface el ctx
// de withAuthOnly). Compartido por la importación unitaria y la masiva.
type CloneCtx = { supabase: SupabaseClient<Database>; orgId: string }

export type CloneMode = 'created' | 'revision' | 'skipped'
export type CloneOutcome = {
  id?: string
  /** created: código nuevo (v1 activa) · revision: el código existía (revisión nueva inactiva) · skipped: ya importada. */
  mode?: CloneMode
  version?: number
  isActive?: boolean
  /** false cuando el origen tiene tipo de equipo y la org activa no tiene uno con ese código. */
  equipmentTypeMapped?: boolean
  error?: string
}

function describeCloneError(message: string): string {
  const disc = /Missing discipline "(.+)" in target organization/.exec(message)
  if (disc) return `Falta la disciplina "${disc[1]}" en la org activa. Créala antes de importar.`
  const phase = /Missing phase "(.+)" in target organization/.exec(message)
  if (phase) return `Falta la fase "${phase[1]}" en la org activa. Créala antes de importar.`
  if (message.includes('Source template not found')) return 'Template origen no encontrado o sin acceso'
  if (message.includes('already belongs to the target')) return 'El template ya está en la org activa'
  if (message.includes('Only the active revision')) return 'Solo se importa la revisión activa del origen'
  if (message.includes('membership required')) return 'Se requiere rol de editor en la org activa'
  return message
}

/**
 * Clonación atómica (RPC SECURITY DEFINER clone_itr_template_from_catalog):
 * cabecera completa, secciones, ítems y condiciones en una transacción, con
 * procedencia (source_template_id). Un código que ya existe en la org activa
 * recibe una revisión nueva inactiva (para revisar y activar), nunca se pisa.
 */
async function cloneTemplateInternal(
  ctx: CloneCtx,
  sourceTemplateId: string,
  options?: { codeSuffix?: string },
): Promise<CloneOutcome> {
  const { data, error } = await ctx.supabase.rpc('clone_itr_template_from_catalog', {
    p_source_template_id: sourceTemplateId,
    p_target_org_id: ctx.orgId,
    p_code_suffix: options?.codeSuffix ?? null,
  })
  if (error || !data) return { error: describeCloneError(error?.message ?? 'No se pudo clonar') }
  const r = data as { mode: CloneMode; id: string; version: number; is_active: boolean; equipment_type_mapped: boolean }
  return { id: r.id, mode: r.mode, version: r.version, isActive: r.is_active, equipmentTypeMapped: r.equipment_type_mapped }
}

export const cloneTemplateToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sourceTemplateId: string,
    options?: { codeSuffix?: string },
  ): Promise<CloneOutcome> => {
    const res = await cloneTemplateInternal(ctx, sourceTemplateId, options)
    if (res.id) revalidatePath('/admin/templates')
    return res
  },
)

export interface BulkCloneResult {
  created: number   // códigos nuevos (v1 activa)
  updated: number   // códigos existentes: revisión nueva inactiva
  skipped: number   // ya importados de esa misma revisión origen
  errors: { code: string; reason: string }[]
}

/**
 * Importación masiva desde el catálogo / otra org: clona en secuencia todos
 * los templates indicados. La RPC decide por código: nuevo → v1 activa;
 * existente → revisión nueva inactiva; ya importado → se salta. Re-ejecutable.
 */
export const cloneTemplatesToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, sourceTemplateIds: string[]): Promise<{ result?: BulkCloneResult; error?: string }> => {
    const result: BulkCloneResult = { created: 0, updated: 0, skipped: 0, errors: [] }
    const ids = [...new Set(sourceTemplateIds)].slice(0, 1000)

    const { data: sources } = await ctx.supabase
      .from('itr_templates')
      .select('id, code')
      .in('id', ids)
    const codeById = new Map((sources ?? []).map(t => [t.id, t.code]))

    for (const id of ids) {
      const code = codeById.get(id)
      if (!code) { result.errors.push({ code: id, reason: 'Template origen no encontrado o sin acceso' }); continue }
      const res = await cloneTemplateInternal(ctx, id)
      if (res.error) { result.errors.push({ code, reason: res.error }); continue }
      if (res.mode === 'created') result.created++
      else if (res.mode === 'revision') result.updated++
      else result.skipped++
    }

    if (result.created + result.updated > 0) revalidatePath('/admin/templates')
    return { result }
  },
)
