'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase.generated'

import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { validateOptionOutcomes } from '@/lib/itr/selection-outcome'
import { checkTableConfig, type TableConfig } from '@/lib/itr/table'
import { continuityMeasurementRequired, type ContinuityOptions } from '@/lib/itr/continuity'
import { localState, templateContentHash, type LocalState } from '@/lib/itr/clone'
import { detectItrPhase } from '@/lib/utils'
import { normalizeRequired } from '@/lib/itr/signatures'
import { fromJson } from '@/lib/supabase/casts'
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
    data: { code?: string; title?: string; description?: string | null; is_active?: boolean; required_signatures?: string[] },
  ): Promise<{ error?: string }> => {
    // S04 (D4): el ejecutor siempre; se guarda en orden. Cambiarlo en una plantilla ya usada solo afecta a los ITR nuevos.
    const patch = 'required_signatures' in data ? { ...data, required_signatures: normalizeRequired(data.required_signatures) } : data
    const { error } = await ctx.supabase
      .from('itr_templates')
      .update(patch)
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath('/admin/templates')
    return {}
  },
)

// I-14 (S08): la RLS de borrado es owner/admin/architect; con EDITOR el leader veía «borrado» y no pasaba
// nada (0 filas sin error). Mismo tier que la RLS y se comprueba que algo se borró.
export const deleteTemplate = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { data, error } = await ctx.supabase
      .from('itr_templates')
      .delete()
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .select('id')

    if (error) return { error: /violates foreign key|Assigned revision/i.test(error.message) ? t('itrTemplates.hasItrs') : error.message }
    if (!data?.length) return { error: t('itrTemplates.deleteFailed') }
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
  /** string[] para listas; TableConfig para tablas de registro; en continuidad, si la lectura es obligatoria (A38); null en el resto. */
  options?: string[] | TableConfig | ContinuityOptions | null
  option_outcomes?: Record<string, 'pass' | 'fail' | 'not_applicable'>
  order_index: number
  condition_item_id?: string | null
  condition_value?: string | null
}

/** A38: en continuidad solo se guarda si la lectura es obligatoria; cualquier otra cosa = lectura opcional (null). */
function continuityOptions(options: unknown): ContinuityOptions | null {
  return continuityMeasurementRequired(options) ? { measurement_required: true } : null
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
    const t = await getTranslations('ActionErrors')
    if (selectItemMissingOptions(data)) return { error: t('itrTemplates.selectNeedsOption') }
    if (data.item_type === 'continuity') data = { ...data, options: continuityOptions(data.options) }
    if (data.item_type === 'table') { const c = checkTableConfig(data.options); if (!c.config) return { error: t('itrTemplates.tableInvalid', { issue: c.issue ?? '' }) } }
    if (!validateOptionOutcomes(data.options ?? null, data.option_outcomes ?? {})) return { error: t('itrTemplates.outcomesInvalid') }
    if (data.item_type !== 'select' && Object.keys(data.option_outcomes ?? {}).length) return { error: t('itrTemplates.outcomesSelectOnly') }
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
    const t = await getTranslations('ActionErrors')
    const { data: current, error: readError } = await ctx.supabase.from('itr_template_items')
      .select('item_type, options, option_outcomes').eq('id', itemId).single()
    if (readError || !current) return { error: t('itrTemplates.itemNotFound') }
    if ((data.item_type ?? current.item_type) === 'continuity' && 'options' in data) data = { ...data, options: continuityOptions(data.options) }
    const merged = { ...current, ...data }
    if (merged.item_type === 'select' && !(Array.isArray(merged.options) && merged.options.length)) return { error: t('itrTemplates.selectNeedsOption') }
    if (merged.item_type === 'table') { const c = checkTableConfig(merged.options); if (!c.config) return { error: t('itrTemplates.tableInvalid', { issue: c.issue ?? '' }) } }
    const outcomes = data.option_outcomes ?? current.option_outcomes ?? {}
    if (!validateOptionOutcomes(merged.options, outcomes)) return { error: t('itrTemplates.outcomesInvalid') }
    if (merged.item_type !== 'select' && Object.keys(outcomes).length) return { error: t('itrTemplates.outcomesSelectOnly') }
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
    const t = await getTranslations('ActionErrors')
    const { data: tpl } = await ctx.supabase
      .from('itr_templates').select('id').eq('id', templateId).eq('org_id', ctx.orgId).maybeSingle()
    if (!tpl) return { error: t('itrInstances.templateNotFound') }
    const { data, error } = await ctx.supabase.rpc('create_itr_template_revision', { p_template_id: templateId })
    if (error || !data) return { error: error?.message ?? t('itrTemplates.revisionCreateFailed') }
    revalidatePath('/admin/templates')
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath(`/admin/templates/${data}`)
    return { newTemplateId: data }
  },
)

export const activateTemplateRevision = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ version?: number; deactivated?: number; matrixRepointed?: number; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { data: tpl } = await ctx.supabase
      .from('itr_templates')
      .select('id, itr_template_items(id, item_number, description, item_type, options)')
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .maybeSingle()
    if (!tpl) return { error: t('itrInstances.templateNotFound') }
    if (tpl.itr_template_items.length === 0) return { error: t('itrTemplates.revisionNoItems') }
    // Un select sin opciones deja el ITR de campo sin poder completarse — no activable
    const badSelects = tpl.itr_template_items
      .filter(it => it.item_type === 'select' && !(Array.isArray(it.options) && it.options.length > 0))
    if (badSelects.length > 0) {
      const names = badSelects.map(it => it.item_number ?? it.description.slice(0, 40)).join(', ')
      return { error: t('itrTemplates.selectsWithoutOptions', { names }) }
    }
    const { data, error } = await ctx.supabase.rpc('activate_itr_template_revision', { p_template_id: templateId })
    if (error || !data) return { error: error?.message ?? t('itrTemplates.revisionActivateFailed') }
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
    const t = await getTranslations('ActionErrors')
    // Verify template belongs to org
    const { data: template } = await ctx.supabase
      .from('itr_templates')
      .select('id')
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .single()

    if (!template) return { error: t('itrInstances.templateNotFound'), sectionsCreated: 0, itemsCreated: 0 }

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
    const t = await getTranslations('ActionErrors')
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
        result.errors.push(t('itrTemplates.catalogDisciplineUnmapped', { code, discipline: discLetter }))
        result.templatesSkipped++
        continue
      }
      if (!phaseId) {
        result.errors.push(t('itrTemplates.catalogPhaseUnmapped', { code, phase }))
        result.templatesSkipped++
        continue
      }
      toProcess.push({ code, codeRows, disciplineId, phaseId })
    }

    // Process all templates in parallel (each template needs 3 sequential steps internally).
    // A40: nace inactiva y se activa solo con sus ítems; si un paso falla se borra (nunca una plantilla activa vacía).
    const outcomes = await Promise.all(toProcess.map(async ({ code, codeRows, disciplineId, phaseId }) => {
      const { data: template, error: tErr } = await ctx.supabase
        .from('itr_templates')
        .insert({ org_id: ctx.orgId, code, title: code, discipline_id: disciplineId, phase_id: phaseId, is_active: false, is_global: false })
        .select('id')
        .single()

      if (tErr || !template) return { ok: false, error: tErr ? `${code}: ${tErr.message}` : t('itrTemplates.catalogTemplateFailed', { code }), count: 0 }

      const { data: section, error: sErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: template.id, title: 'Ítems de Inspección', order_index: 0 })
        .select('id')
        .single()

      const abandon = async (error: string) => {
        await ctx.supabase.from('itr_templates').delete().eq('id', template.id)
        return { ok: false, error, count: 0 }
      }
      if (sErr || !section) return abandon(t('itrTemplates.catalogSectionFailed', { code }))

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
      if (iErr) return abandon(t('itrTemplates.catalogItemsFailed', { code, detail: iErr.message }))
      const { error: aErr } = await ctx.supabase.from('itr_templates').update({ is_active: true }).eq('id', template.id)
      if (aErr) return abandon(t('itrTemplates.catalogItemsFailed', { code, detail: aErr.message }))
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
  id, code, title, title_es, description, version, org_id, is_global, required_signatures, requires_test_equipment,
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
        .select('code, version, required_signatures, requires_test_equipment, itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value))')
        .eq('org_id', ctx.orgId),
    ])

    if (error) return { templates: [], error: error.message }

    const localLatest = new Map<string, { version: number; hash: string }>()
    for (const t of local ?? []) {
      const prev = localLatest.get(t.code)
      if (!prev || t.version > prev.version) localLatest.set(t.code, { version: t.version, hash: templateContentHash(t.itr_template_sections, t) })
    }

    const templates: ImportableTemplate[] = ((data ?? [])).map(t => {
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
        localState: localState(templateContentHash(t.itr_template_sections, t), mine),
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
    const t = await getTranslations('ActionErrors')
    const { data: raw } = await ctx.supabase
      .from('itr_templates')
      .select(CLONE_SELECT)
      .eq('id', sourceTemplateId)
      .single()
    const source = raw

    if (!source) return { error: t('itrTemplates.sourceNotFound') }
    if (source.org_id === ctx.orgId) return { error: t('itrTemplates.alreadyInOrg') }

    const discCode = codeOf(source.disciplines)
    const phaseCode = codeOf(source.project_phases)
    if (!discCode || !phaseCode) {
      return { error: t('itrTemplates.sourceNoDisciplinePhase') }
    }

    const newCode = `${source.code}${options?.codeSuffix ?? ''}`
    const sourceHash = templateContentHash(source.itr_template_sections, source)

    const [{ data: existingRaw }, { data: sourceOrg }] = await Promise.all([
      ctx.supabase
        .from('itr_templates')
        .select('id, version, required_signatures, requires_test_equipment, itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value))')
        .eq('org_id', ctx.orgId)
        .eq('code', newCode)
        .order('version', { ascending: false }),
      ctx.supabase.from('organizations').select('name').eq('id', source.org_id).maybeSingle(),
    ])
    const existing = existingRaw ?? []

    let version = 1
    if (existing.length > 0) {
      if (!options?.updateExisting) {
        return { error: t('itrTemplates.codeExists', { code: newCode }) }
      }
      const latest = existing[0]
      // A40: «al día» compara también firmas requeridas y equipo de prueba.
      if (templateContentHash(latest.itr_template_sections, latest) === sourceHash) return { id: latest.id, kind: 'unchanged' }
      version = latest.version + 1
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const provenance = `Importada de «${sourceOrg?.name ?? 'otra organización'}» (v${source.version}, ${stamp}).`
    // Sin encadenar notas de procedencia de importaciones anteriores.
    const sourceDescription = (source.description ?? '').replace(/(?:Revisión \d+: )?[Ii]mportada de «[^»]*» \([^)]*\)\.?\s*/g, '').trim() || null
    const description = version > 1
      ? `Revisión ${version}: ${provenance}${sourceDescription ? ' ' + sourceDescription : ''}`
      : sourceDescription ?? provenance

    // A40: la copia entera (plantilla con firmas y equipo de prueba, secciones, ítems, condiciones, matriz equipo×ITR
    // de un código nuevo y auditoría) es UNA transacción en la BD; un código nuevo se activa al final. Si otra
    // importación movió la última revisión desde que se comparó, la RPC falla (CU409) en vez de duplicar.
    const { data, error } = await ctx.supabase.rpc('clone_itr_template_from_catalog', {
      p_source_template_id: source.id,
      p_target_org_id: ctx.orgId,
      p_code_suffix: options?.codeSuffix ?? undefined,
      p_update_existing: !!options?.updateExisting,
      p_expected_latest_version: existing[0]?.version ?? undefined,
      p_description: description,
      p_content_hash: sourceHash,
    })
    if (error) return { error: importError(error, t, { code: newCode, discipline: discCode, phase: phaseCode }) }
    const res = fromJson<{ id: string; kind: 'created' | 'revision' }>(data)
    return { id: res.id, kind: res.kind }
}

/** Errores de la RPC de importación → mensajes de la acción (lo desconocido sale tal cual). */
function importError(
  error: { message: string; code?: string },
  t: Awaited<ReturnType<typeof getTranslations<'ActionErrors'>>>,
  ctx: { code: string; discipline: string; phase: string },
): string {
  if (/Missing discipline/.test(error.message)) return t('itrTemplates.missingDiscipline', { code: ctx.discipline })
  if (/Missing phase/.test(error.message)) return t('itrTemplates.missingPhase', { code: ctx.phase })
  if (/already exists in the target/.test(error.message)) return t('itrTemplates.codeExists', { code: ctx.code })
  if (error.code === 'CU409') return t('itrTemplates.changedWhileImporting', { code: ctx.code })
  if (/Source template not found|Only the active revision/.test(error.message)) return t('itrTemplates.sourceNotFound')
  return error.message
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
    const t = await getTranslations('ActionErrors')
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
      if (!code) { result.errors.push({ code: id, reason: t('itrTemplates.sourceNotFound') }); continue }
      if (existingCodes.has(code) && !options?.updateExisting) { result.skipped++; continue }
      const res = await cloneTemplateInternal(ctx, id, { updateExisting: options?.updateExisting })
      if (res.kind === 'created') { result.created++; existingCodes.add(code) }
      else if (res.kind === 'revision') result.revisions++
      else if (res.kind === 'unchanged') result.unchanged++
      else result.errors.push({ code, reason: res.error ?? t('itrTemplates.cloneFailed') })
    }

    if (result.created > 0 || result.revisions > 0) revalidatePath('/admin/templates')
    return { result }
  },
)
