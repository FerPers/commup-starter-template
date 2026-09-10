'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase.generated'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'
import { validateOptionOutcomes } from '@/lib/itr/selection-outcome'
import { parseTableConfig, type TableConfig } from '@/lib/itr/table'
import { conditionRemaps, itemInsertRow, localState, orderedSections, templateContentHash, type CloneSectionSource, type LocalState } from '@/lib/itr/clone'
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
  /** Copia local (última revisión por código): 'new' no existe · 'same' idéntica · 'outdated' distinta. */
  localState: LocalState
  localVersion: number | null
}

const CLONE_SELECT = `
  id, code, title, title_es, description, version, org_id, is_global,
  disciplines(code),
  project_phases(code),
  equipment_types(code),
  itr_template_sections(
    id, title, order_index,
    itr_template_items(
      id, item_number, description, description_es, description_es_source, item_type, is_required,
      is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit,
      acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value
    )
  )
`

type CloneSource = {
  id: string; code: string; title: string; title_es: string | null; description: string | null; version: number
  org_id: string; is_global: boolean
  disciplines: { code: string } | { code: string }[] | null
  project_phases: { code: string } | { code: string }[] | null
  equipment_types: { code: string } | { code: string }[] | null
  itr_template_sections: CloneSectionSource[]
}

const codeOf = (rel: { code: string } | { code: string }[] | null | undefined) =>
  Array.isArray(rel) ? rel[0]?.code ?? null : rel?.code ?? null

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

    const [{ data, error }, { data: local }] = await Promise.all([
      ctx.supabase
        .from('itr_templates')
        .select(CLONE_SELECT)
        .in('org_id', otherOrgIds)
        .eq('is_active', true)
        .order('code'),
      // Última revisión local por código (activa o borrador) para saber si la del catálogo es distinta.
      ctx.supabase
        .from('itr_templates')
        .select('code, version, itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value))')
        .eq('org_id', ctx.orgId),
    ])

    if (error) return { templates: [], error: error.message }

    const localLatest = new Map<string, { version: number; hash: string }>()
    for (const t of (local ?? []) as Array<{ code: string; version: number; itr_template_sections: CloneSectionSource[] }>) {
      const prev = localLatest.get(t.code)
      if (!prev || t.version > prev.version) localLatest.set(t.code, { version: t.version, hash: templateContentHash(t.itr_template_sections) })
    }

    const templates: ImportableTemplate[] = ((data ?? []) as unknown as CloneSource[]).map(t => {
      const info = orgInfo.get(t.org_id)
      const mine = localLatest.get(t.code) ?? null
      return {
        id: t.id,
        code: t.code,
        title: t.title,
        version: t.version,
        disciplineCode: codeOf(t.disciplines),
        phaseCode: codeOf(t.project_phases),
        sourceOrgId: t.org_id,
        sourceOrgName: info?.name ?? '—',
        sourceOrgIsCatalog: info?.isCatalog ?? false,
        sectionCount: t.itr_template_sections.length,
        itemCount: t.itr_template_sections.reduce((sum, s) => sum + s.itr_template_items.length, 0),
        localState: localState(templateContentHash(t.itr_template_sections), mine),
        localVersion: mine?.version ?? null,
      }
    })

    return { templates }
  },
)

// Contexto mínimo que necesita la clonación (estructural: lo satisface el ctx
// de withAuthOnly). Compartido por la importación unitaria y la masiva.
type CloneCtx = { supabase: SupabaseClient<Database>; orgId: string; userId: string }

export type CloneKind = 'created' | 'revision' | 'unchanged'

/**
 * Copia una plantilla de otra org (catálogo o una org de la que el usuario es
 * miembro) en la org activa.
 *  - Código nuevo en la org activa → v1 activa, con su fila en la matriz
 *    equipo×ITR cuando el tipo de equipo existe por código.
 *  - Código ya existente y `updateExisting` → revisión inactiva v(max+1) con el
 *    contenido del origen (el editor la activa con «Activar esta revisión», que
 *    re-apunta la matriz). Si la última revisión local ya es idéntica, no crea nada.
 * Nunca modifica la plantilla de origen ni las revisiones locales existentes.
 */
async function cloneTemplateInternal(
  ctx: CloneCtx,
  sourceTemplateId: string,
  options?: { codeSuffix?: string; updateExisting?: boolean },
): Promise<{ id?: string; kind?: CloneKind; error?: string }> {
    const { data: raw } = await ctx.supabase
      .from('itr_templates')
      .select(CLONE_SELECT)
      .eq('id', sourceTemplateId)
      .single()
    const source = raw as unknown as CloneSource | null

    if (!source) return { error: 'Template origen no encontrado o sin acceso' }
    if (source.org_id === ctx.orgId) return { error: 'El template ya está en la org activa' }

    const discCode = codeOf(source.disciplines)
    const phaseCode = codeOf(source.project_phases)
    const equipmentCode = codeOf(source.equipment_types)
    if (!discCode || !phaseCode) {
      return { error: 'Template origen sin disciplina o fase válida' }
    }

    // Map source discipline + phase (+ tipo de equipo, opcional) by code into
    // the target org. RLS ensures we only see rows in the active org here.
    const [{ data: targetDisc }, { data: targetPhase }, { data: targetEquipment }, { data: sourceOrg }] = await Promise.all([
      ctx.supabase.from('disciplines').select('id').eq('org_id', ctx.orgId).eq('code', discCode).maybeSingle(),
      ctx.supabase.from('project_phases').select('id').eq('org_id', ctx.orgId).eq('code', phaseCode).maybeSingle(),
      equipmentCode
        ? ctx.supabase.from('equipment_types').select('id').eq('org_id', ctx.orgId).eq('code', equipmentCode).maybeSingle()
        : Promise.resolve({ data: null }),
      ctx.supabase.from('organizations').select('name').eq('id', source.org_id).maybeSingle(),
    ])

    if (!targetDisc) {
      return { error: `Falta la disciplina "${discCode}" en la org activa. Créala antes de importar.` }
    }
    if (!targetPhase) {
      return { error: `Falta la fase "${phaseCode}" en la org activa. Créala antes de importar.` }
    }

    const newCode = `${source.code}${options?.codeSuffix ?? ''}`
    const sourceHash = templateContentHash(source.itr_template_sections)

    const { data: existingRaw } = await ctx.supabase
      .from('itr_templates')
      .select('id, version, itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value))')
      .eq('org_id', ctx.orgId)
      .eq('code', newCode)
      .order('version', { ascending: false })
    const existing = (existingRaw ?? []) as unknown as Array<{ id: string; version: number; itr_template_sections: CloneSectionSource[] }>

    let version = 1
    let kind: CloneKind = 'created'
    if (existing.length > 0) {
      if (!options?.updateExisting) {
        return { error: `Ya existe un template con código "${newCode}" en esta org. Usa «Actualizar» para traer el contenido del catálogo como revisión nueva.` }
      }
      const latest = existing[0]
      if (templateContentHash(latest.itr_template_sections) === sourceHash) return { id: latest.id, kind: 'unchanged' }
      version = latest.version + 1
      kind = 'revision'
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const provenance = `Importada de «${sourceOrg?.name ?? 'otra organización'}» (v${source.version}, ${stamp}).`
    const { data: cloned, error: tplErr } = await ctx.supabase
      .from('itr_templates')
      .insert({
        org_id: ctx.orgId,
        discipline_id: targetDisc.id,
        phase_id: targetPhase.id,
        equipment_type_id: targetEquipment?.id ?? null,
        code: newCode,
        title: source.title,
        title_es: source.title_es,
        description: kind === 'revision'
          ? `Revisión ${version}: ${provenance}${source.description ? ' ' + source.description : ''}`
          : source.description ?? provenance,
        version,
        is_active: kind === 'created',
        is_global: false,
      })
      .select('id')
      .single()

    if (tplErr || !cloned) return { error: tplErr?.message ?? 'No se pudo crear el template' }

    // Secciones e ítems en dos pasadas: primero las filas, luego las condiciones
    // re-mapeadas a los ids copiados (igual que create_itr_template_revision).
    const idMap = new Map<string, string>()
    for (const sec of orderedSections(source.itr_template_sections)) {
      const { data: newSec, error: secErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: cloned.id, title: sec.title, order_index: sec.order_index })
        .select('id')
        .single()
      if (secErr || !newSec) return { error: `No se pudo copiar la sección «${sec.title}»: ${secErr?.message ?? 'sin id'}` }
      if (sec.itr_template_items.length === 0) continue
      const rows = sec.itr_template_items.map(item => itemInsertRow(item, newSec.id, cloned.id))
      const { data: inserted, error: itemErr } = await ctx.supabase
        .from('itr_template_items')
        .insert(rows as unknown as Database['public']['Tables']['itr_template_items']['Insert'][])
        .select('id, order_index')
      if (itemErr || !inserted) return { error: `No se pudieron copiar los ítems de «${sec.title}»: ${itemErr?.message ?? 'sin filas'}` }
      const byOrder = [...inserted].sort((a, b) => a.order_index - b.order_index)
      sec.itr_template_items.forEach((item, i) => { if (byOrder[i]) idMap.set(item.id, byOrder[i].id) })
    }
    for (const c of conditionRemaps(source.itr_template_sections, idMap)) {
      await ctx.supabase.from('itr_template_items')
        .update({ condition_item_id: c.condition_item_id, condition_value: c.condition_value })
        .eq('id', c.id)
    }

    // Matriz equipo×ITR: solo para códigos nuevos (una revisión hereda la matriz
    // al activarse). Se copian las filas del origen cuyo tipo de equipo exista por código.
    let matrixRows = 0
    if (kind === 'created') {
      const { data: srcMatrix } = await ctx.supabase
        .from('equipment_type_templates')
        .select('status, source, confidence, reason, model, equipment_types(code)')
        .eq('itr_template_id', source.id)
      const codes = [...new Set((srcMatrix ?? []).map(m => codeOf(m.equipment_types as { code: string } | { code: string }[] | null)).filter((c): c is string => !!c))]
      if (codes.length > 0) {
        const { data: targetTypes } = await ctx.supabase
          .from('equipment_types').select('id, code').eq('org_id', ctx.orgId).in('code', codes)
        const typeByCode = new Map((targetTypes ?? []).map(t => [t.code, t.id]))
        const rows = (srcMatrix ?? []).flatMap(m => {
          const typeId = typeByCode.get(codeOf(m.equipment_types as { code: string } | { code: string }[] | null) ?? '')
          return typeId ? [{ org_id: ctx.orgId, equipment_type_id: typeId, itr_template_id: cloned.id, status: m.status, source: m.source, confidence: m.confidence, reason: m.reason, model: m.model }] : []
        })
        if (rows.length > 0) {
          const { error: mErr } = await ctx.supabase.from('equipment_type_templates').insert(rows)
          if (!mErr) matrixRows = rows.length
        }
      }
    }

    await ctx.supabase.from('activity_log').insert({
      org_id: ctx.orgId, user_id: ctx.userId, entity_type: 'itr_template', entity_id: cloned.id, action: 'template_imported',
      payload: { code: newCode, version, kind, source_org_id: source.org_id, source_template_id: source.id, source_version: source.version, content_hash: sourceHash, matrix_rows: matrixRows },
    })

    return { id: cloned.id, kind }
}

export const cloneTemplateToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sourceTemplateId: string,
    options?: { codeSuffix?: string; updateExisting?: boolean },
  ): Promise<{ id?: string; kind?: CloneKind; error?: string }> => {
    const res = await cloneTemplateInternal(ctx, sourceTemplateId, options)
    if (res.id && res.kind !== 'unchanged') revalidatePath('/admin/templates')
    return res
  },
)

export interface BulkCloneResult {
  created: number
  revisions: number  // códigos existentes actualizados como revisión inactiva
  unchanged: number  // códigos existentes cuya última revisión ya era idéntica
  skipped: number    // ya existían y no se pidió actualizar
  errors: { code: string; reason: string }[]
}

/**
 * Importación masiva desde el catálogo / otra org: clona en secuencia todos
 * los templates indicados. Sin `updateExisting`, los que ya existen (mismo
 * código) se saltan sin error; con él, reciben una revisión inactiva cuando el
 * contenido difiere. Re-ejecutable: nunca duplica.
 */
export const cloneTemplatesToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, sourceTemplateIds: string[], options?: { updateExisting?: boolean }): Promise<{ result?: BulkCloneResult; error?: string }> => {
    const result: BulkCloneResult = { created: 0, revisions: 0, unchanged: 0, skipped: 0, errors: [] }
    const ids = [...new Set(sourceTemplateIds)].slice(0, 1000)

    const { data: sources } = await ctx.supabase
      .from('itr_templates')
      .select('id, code')
      .in('id', ids)
    const codeById = new Map((sources ?? []).map(t => [t.id, t.code]))

    const { data: existing } = await ctx.supabase
      .from('itr_templates')
      .select('code')
      .eq('org_id', ctx.orgId)
    const existingCodes = new Set((existing ?? []).map(t => t.code))

    for (const id of ids) {
      const code = codeById.get(id)
      if (!code) { result.errors.push({ code: id, reason: 'Template origen no encontrado o sin acceso' }); continue }
      if (existingCodes.has(code) && !options?.updateExisting) { result.skipped++; continue }
      const res = await cloneTemplateInternal(ctx, id, { updateExisting: options?.updateExisting })
      if (res.kind === 'created') { result.created++; existingCodes.add(code) }
      else if (res.kind === 'revision') result.revisions++
      else if (res.kind === 'unchanged') result.unchanged++
      else result.errors.push({ code, reason: res.error ?? 'No se pudo clonar' })
    }

    if (result.created > 0 || result.revisions > 0) revalidatePath('/admin/templates')
    return { result }
  },
)
