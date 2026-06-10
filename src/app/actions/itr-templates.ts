'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'
import { detectItrPhase } from '@/lib/utils'

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
  item_type: string
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_measurement: boolean
  unit?: string | null
  acceptance_min?: number | null
  acceptance_max?: number | null
  acceptance_text?: string | null
  order_index: number
  condition_item_id?: string | null
  condition_value?: string | null
}

export const createItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sectionId: string,
    templateId: string,
    data: ItemPayload,
  ): Promise<{ id?: string; error?: string }> => {
    const { data: item, error } = await ctx.supabase
      .from('itr_template_items')
      .insert({ ...data, section_id: sectionId, template_id: templateId })
      .select('id')
      .single()

    if (error) return { error: error.message }
    return { id: item.id }
  },
)

export const updateItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, itemId: string, data: Partial<ItemPayload>): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('itr_template_items')
      .update(data)
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

// ── Publish new template version ─────────────────────────────────

export const publishTemplateVersion = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    templateId: string,
  ): Promise<{ newTemplateId?: string; bumpedInPlace?: boolean; error?: string }> => {
    // Load current template (org check)
    const { data: tpl } = await ctx.supabase
      .from('itr_templates')
      .select(`
        id, org_id, code, title, description, phase_id, discipline_id,
        version, is_active, is_global,
        itr_template_sections(
          id, title, order_index,
          itr_template_items(
            id, item_number, description, description_es, item_type,
            is_required, is_critical, requires_photo, requires_measurement,
            unit, acceptance_min, acceptance_max, acceptance_text, options, order_index,
            condition_item_id, condition_value
          )
        )
      `)
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .single()

    if (!tpl) return { error: 'Template no encontrado' }

    // Check if any ITRs are already assigned to this template
    const { count: itrCount } = await ctx.supabase
      .from('itrs')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)

    // No ITRs assigned → bump version in place (no copy needed)
    if (!itrCount) {
      const { error } = await ctx.supabase
        .from('itr_templates')
        .update({ version: tpl.version + 1 })
        .eq('id', templateId)
      if (error) return { error: error.message }
      revalidatePath(`/admin/templates/${templateId}`)
      return { newTemplateId: templateId, bumpedInPlace: true }
    }

    // ITRs exist → create a new template copy with version+1
    const { data: newTpl, error: tplErr } = await ctx.supabase
      .from('itr_templates')
      .insert({
        org_id: ctx.orgId,
        code: tpl.code,
        title: tpl.title,
        description: tpl.description,
        phase_id: tpl.phase_id,
        discipline_id: tpl.discipline_id,
        version: tpl.version + 1,
        is_active: true,
        is_global: tpl.is_global,
      })
      .select('id')
      .single()

    if (tplErr || !newTpl) return { error: tplErr?.message ?? 'Error al crear versión' }

    // Mark old template inactive
    await ctx.supabase
      .from('itr_templates')
      .update({ is_active: false })
      .eq('id', templateId)

    // Sort sections by order_index
    const sections = [...tpl.itr_template_sections].sort((a, b) => a.order_index - b.order_index)

    // Copy sections + items; build old→new item id map for condition_item_id remapping
    const itemIdMap = new Map<string, string>()

    for (const sec of sections) {
      const { data: newSec, error: secErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: newTpl.id, title: sec.title, order_index: sec.order_index })
        .select('id')
        .single()

      if (secErr || !newSec) continue

      const items = [...sec.itr_template_items].sort((a, b) => a.order_index - b.order_index)
      if (items.length === 0) continue

      // Insert items without condition_item_id first (to get new IDs)
      const rows = items.map(it => ({
        section_id: newSec.id,
        template_id: newTpl.id,
        item_number: it.item_number,
        description: it.description,
        description_es: it.description_es,
        item_type: it.item_type,
        is_required: it.is_required,
        is_critical: it.is_critical,
        requires_photo: it.requires_photo,
        requires_measurement: it.requires_measurement,
        unit: it.unit,
        acceptance_min: it.acceptance_min,
        acceptance_max: it.acceptance_max,
        acceptance_text: it.acceptance_text,
        options: it.options,
        order_index: it.order_index,
        condition_value: it.condition_value,
        // condition_item_id will be patched after all items are inserted
      }))

      const { data: newItems } = await ctx.supabase
        .from('itr_template_items')
        .insert(rows)
        .select('id, order_index')

      if (newItems) {
        items.forEach((oldItem, idx) => {
          const newItem = newItems.find(ni => ni.order_index === idx)
          if (newItem) itemIdMap.set(oldItem.id, newItem.id)
        })
      }
    }

    // Patch condition_item_id using the id map
    for (const sec of sections) {
      for (const oldItem of sec.itr_template_items) {
        if (!oldItem.condition_item_id) continue
        const newItemId = itemIdMap.get(oldItem.id)
        const newCondId = itemIdMap.get(oldItem.condition_item_id)
        if (newItemId && newCondId) {
          await ctx.supabase
            .from('itr_template_items')
            .update({ condition_item_id: newCondId })
            .eq('id', newItemId)
        }
      }
    }

    revalidatePath('/admin/templates')
    revalidatePath(`/admin/templates/${templateId}`)
    revalidatePath(`/admin/templates/${newTpl.id}`)
    return { newTemplateId: newTpl.id }
  },
)

// ── Bulk import from Excel ─────────────────────────────────────

export interface ImportSection {
  title: string
  items: Array<{
    item_number: string | null
    description: string
    description_es: string | null
    item_type: string
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
        item_type: row.tipo === TIPO_ESPECIAL ? 'text' : 'checkbox',
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

    const templates: ImportableTemplate[] = (data ?? []).map(t => {
      const disc = t.disciplines as { code: string } | { code: string }[] | null
      const phase = t.project_phases as { code: string } | { code: string }[] | null
      const sections = (t.itr_template_sections ?? []) as Array<{ id: string; itr_template_items: { id: string }[] }>
      const info = orgInfo.get(t.org_id as string)
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
      }
    })

    return { templates }
  },
)

export const cloneTemplateToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sourceTemplateId: string,
    options?: { codeSuffix?: string },
  ): Promise<{ id?: string; error?: string }> => {
    // Verify the source template belongs to an org the user is a member of.
    const { data: source } = await ctx.supabase
      .from('itr_templates')
      .select(`
        id, code, title, description, version, org_id, is_global,
        disciplines(code),
        project_phases(code),
        itr_template_sections(
          id, title, order_index,
          itr_template_items(
            item_number, description, description_es, item_type, is_required,
            is_critical, requires_photo, requires_measurement, options, unit,
            acceptance_min, acceptance_max, acceptance_text, order_index
          )
        )
      `)
      .eq('id', sourceTemplateId)
      .single()

    if (!source) return { error: 'Template origen no encontrado o sin acceso' }
    if (source.org_id === ctx.orgId) return { error: 'El template ya está en la org activa' }

    const sourceDisc = source.disciplines as { code: string } | { code: string }[] | null
    const sourcePhase = source.project_phases as { code: string } | { code: string }[] | null
    const discCode = Array.isArray(sourceDisc) ? sourceDisc[0]?.code : sourceDisc?.code
    const phaseCode = Array.isArray(sourcePhase) ? sourcePhase[0]?.code : sourcePhase?.code

    if (!discCode || !phaseCode) {
      return { error: 'Template origen sin disciplina o fase válida' }
    }

    // Map source discipline + phase by code into target org. RLS ensures we only
    // see rows in the active org here.
    const [{ data: targetDisc }, { data: targetPhase }] = await Promise.all([
      ctx.supabase
        .from('disciplines')
        .select('id')
        .eq('org_id', ctx.orgId)
        .eq('code', discCode)
        .maybeSingle(),
      ctx.supabase
        .from('project_phases')
        .select('id')
        .eq('org_id', ctx.orgId)
        .eq('code', phaseCode)
        .maybeSingle(),
    ])

    if (!targetDisc) {
      return { error: `Falta la disciplina "${discCode}" en la org activa. Créala antes de importar.` }
    }
    if (!targetPhase) {
      return { error: `Falta la fase "${phaseCode}" en la org activa. Créala antes de importar.` }
    }

    const newCode = `${source.code}${options?.codeSuffix ?? ''}`

    const { data: existing } = await ctx.supabase
      .from('itr_templates')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('code', newCode)
      .maybeSingle()

    if (existing) {
      return { error: `Ya existe un template con código "${newCode}" en esta org` }
    }

    const { data: cloned, error: tplErr } = await ctx.supabase
      .from('itr_templates')
      .insert({
        org_id: ctx.orgId,
        discipline_id: targetDisc.id,
        phase_id: targetPhase.id,
        code: newCode,
        title: source.title,
        description: source.description,
        version: 1,
        is_active: true,
        is_global: false,
      })
      .select('id')
      .single()

    if (tplErr || !cloned) return { error: tplErr?.message ?? 'No se pudo crear el template' }

    const sections = (source.itr_template_sections ?? []) as Array<{
      title: string
      order_index: number
      itr_template_items: Array<Record<string, unknown>>
    }>

    for (const sec of sections) {
      const { data: newSec, error: secErr } = await ctx.supabase
        .from('itr_template_sections')
        .insert({ template_id: cloned.id, title: sec.title, order_index: sec.order_index })
        .select('id')
        .single()

      if (secErr || !newSec) continue

      if (sec.itr_template_items.length > 0) {
        const itemRows = sec.itr_template_items.map(item => ({
          ...item,
          section_id: newSec.id,
          template_id: cloned.id,
        }))
        await ctx.supabase.from('itr_template_items').insert(itemRows)
      }
    }

    revalidatePath('/admin/templates')
    return { id: cloned.id }
  },
)
