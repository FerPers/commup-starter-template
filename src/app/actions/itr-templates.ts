'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { detectItrPhase } from '@/lib/utils'

const TIPO_ESPECIAL = 'Especial / Matriz'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!m || !EDITOR_ROLES.includes(m.role)) return null
  return { supabase, orgId: m.org_id as string }
}

// ── Templates ──────────────────────────────────────────────────

export async function createTemplate(data: {
  code: string
  title: string
  description?: string
  phase_id: string
  discipline_id: string
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { data: t, error } = await ctx.supabase
    .from('itr_templates')
    .insert({ ...data, org_id: ctx.orgId })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/admin/templates')
  return { id: t.id }
}

export async function updateTemplateHeader(
  templateId: string,
  data: { code?: string; title?: string; description?: string | null; is_active?: boolean }
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_templates')
    .update(data)
    .eq('id', templateId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/templates/${templateId}`)
  revalidatePath('/admin/templates')
  return {}
}

export async function deleteTemplate(templateId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_templates')
    .delete()
    .eq('id', templateId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/templates')
  return {}
}

// ── Sections ───────────────────────────────────────────────────

export async function createSection(
  templateId: string,
  title: string,
  orderIndex: number
): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { data: s, error } = await ctx.supabase
    .from('itr_template_sections')
    .insert({ template_id: templateId, title, order_index: orderIndex })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: s.id }
}

export async function updateSection(
  sectionId: string,
  title: string
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_template_sections')
    .update({ title })
    .eq('id', sectionId)

  if (error) return { error: error.message }
  return {}
}

export async function deleteSection(sectionId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_template_sections')
    .delete()
    .eq('id', sectionId)

  if (error) return { error: error.message }
  return {}
}

export async function reorderSections(
  updates: { id: string; order_index: number }[]
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  await Promise.all(updates.map(u =>
    ctx.supabase.from('itr_template_sections').update({ order_index: u.order_index }).eq('id', u.id)
  ))
  return {}
}

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
}

export async function createItem(
  sectionId: string,
  templateId: string,
  data: ItemPayload
): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { data: item, error } = await ctx.supabase
    .from('itr_template_items')
    .insert({ ...data, section_id: sectionId, template_id: templateId })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: item.id }
}

export async function updateItem(
  itemId: string,
  data: Partial<ItemPayload>
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_template_items')
    .update(data)
    .eq('id', itemId)

  if (error) return { error: error.message }
  return {}
}

export async function deleteItem(itemId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itr_template_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: error.message }
  return {}
}

export async function reorderItems(
  updates: { id: string; order_index: number }[]
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  await Promise.all(updates.map(u =>
    ctx.supabase.from('itr_template_items').update({ order_index: u.order_index }).eq('id', u.id)
  ))
  return {}
}

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

export async function importTemplateItems(
  templateId: string,
  sections: ImportSection[],
  replace: boolean
): Promise<{ error?: string; sectionsCreated: number; itemsCreated: number }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos', sectionsCreated: 0, itemsCreated: 0 }

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
}

// ── Bulk import from catalog (all templates at once) ───────────

export interface CatalogRow {
  code: string        // Codigo_ITR  e.g. "E10A"
  discLetter: string  // Disciplina  e.g. "E"
  tipo: string        // Tipo_Item   "Paso Estándar" | "Especial / Matriz"
  itemNo: string      // Item_No     e.g. "1.0", "10.0a", "-"
  description: string // Descripcion_Inspeccion (bilingual, combined)
}

export interface BulkImportResult {
  templatesCreated: number
  templatesSkipped: number
  itemsCreated: number
  errors: string[]
}

export async function bulkImportCatalog(
  rows: CatalogRow[],
  disciplineMap: Record<string, string>,  // discLetter → discipline_id
  phaseMap: Record<string, string>         // 'A' | 'B' | 'C' → phase_id
): Promise<BulkImportResult> {
  const ctx = await getCtx()
  if (!ctx) return { templatesCreated: 0, templatesSkipped: 0, itemsCreated: 0, errors: ['Sin permisos'] }

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

  const result: BulkImportResult = { templatesCreated: 0, templatesSkipped: 0, itemsCreated: 0, errors: [] }

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
    const { data: template, error: tErr } = await ctx!.supabase
      .from('itr_templates')
      .insert({ org_id: ctx!.orgId, code, title: code, discipline_id: disciplineId, phase_id: phaseId, is_active: true, is_global: false })
      .select('id')
      .single()

    if (tErr || !template) return { ok: false, error: `${code}: ${tErr?.message ?? 'error al crear template'}`, count: 0 }

    const { data: section, error: sErr } = await ctx!.supabase
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

    const { error: iErr } = await ctx!.supabase.from('itr_template_items').insert(itemRows)
    if (iErr) return { ok: false, error: `${code}: error al insertar ítems — ${iErr.message}`, count: 0 }
    return { ok: true, error: null, count: itemRows.length }
  }))

  for (const o of outcomes) {
    if (o.ok) { result.templatesCreated++; result.itemsCreated += o.count }
    else if (o.error) result.errors.push(o.error)
  }

  revalidatePath('/admin/templates')
  return result
}
