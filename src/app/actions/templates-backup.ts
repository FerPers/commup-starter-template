'use server'

import { getActiveMembership } from '@/lib/supabase/membership'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  DISCIPLINE_DEFAULTS,
  PHASE_DEFAULTS,
  DEFAULT_DISCIPLINE_COLOR,
  type ItrTemplateBackup,
  type PreservationProcedureBackup,
  type PssrTemplateBackup,
  type TemplatesBackup,
  type RestoreOptions,
  type RestoreResult,
  type TaxonomyPreview,
} from '@/lib/constants/templates-backup'

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

async function getCtx() {
  const ctx = await getActiveMembership()
  if (!ctx) return null
  if (!EDITOR_ROLES.includes(ctx.role)) return null
  return ctx
}

export async function exportAllTemplates(): Promise<{
  backup?: TemplatesBackup
  error?: string
}> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  const { data: org } = await ctx.supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', ctx.orgId)
    .maybeSingle()

  if (!org) return { error: 'Org no encontrada' }

  // ── ITR templates ──────────────────────────────────────
  const { data: itrRaw, error: itrErr } = await ctx.supabase
    .from('itr_templates')
    .select(`
      id, code, title, description, version, is_active, is_global,
      disciplines(code),
      project_phases(code),
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
    .eq('org_id', ctx.orgId)
    .order('code')

  if (itrErr) return { error: `ITR templates: ${itrErr.message}` }

  const itr_templates: ItrTemplateBackup[] = (itrRaw ?? []).map(t => {
    const disc = t.disciplines as { code: string } | { code: string }[] | null
    const phase = t.project_phases as { code: string } | { code: string }[] | null
    const sections = ([...(t.itr_template_sections ?? [])] as Array<{
      id: string
      title: string
      order_index: number
      itr_template_items: Array<Record<string, unknown>>
    }>).sort((a, b) => a.order_index - b.order_index)

    // Build a key map: itemId → "secIdx:itemIdx" so condition_item_id is portable.
    const keyByItemId = new Map<string, string>()
    sections.forEach((sec, sIdx) => {
      const items = ([...sec.itr_template_items] as Array<{ id: string; order_index: number }>)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      items.forEach((it, iIdx) => keyByItemId.set(it.id, `${sIdx}:${iIdx}`))
    })

    return {
      code: t.code as string,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      version: (t.version as number) ?? 1,
      is_active: !!t.is_active,
      is_global: !!t.is_global,
      discipline_code: Array.isArray(disc) ? disc[0]?.code ?? null : disc?.code ?? null,
      phase_code: Array.isArray(phase) ? phase[0]?.code ?? null : phase?.code ?? null,
      sections: sections.map(sec => {
        const items = ([...sec.itr_template_items] as Array<Record<string, unknown>>)
          .sort((a, b) => ((a.order_index as number) ?? 0) - ((b.order_index as number) ?? 0))
        return {
          title: sec.title,
          order_index: sec.order_index,
          items: items.map(it => ({
            item_number: (it.item_number as string | null) ?? null,
            description: (it.description as string) ?? '',
            description_es: (it.description_es as string | null) ?? null,
            item_type: (it.item_type as string) ?? 'checkbox',
            is_required: !!it.is_required,
            is_critical: !!it.is_critical,
            requires_photo: !!it.requires_photo,
            requires_measurement: !!it.requires_measurement,
            unit: (it.unit as string | null) ?? null,
            acceptance_min: (it.acceptance_min as number | null) ?? null,
            acceptance_max: (it.acceptance_max as number | null) ?? null,
            acceptance_text: (it.acceptance_text as string | null) ?? null,
            options: it.options ?? null,
            order_index: (it.order_index as number) ?? 0,
            condition_key: it.condition_item_id
              ? keyByItemId.get(it.condition_item_id as string) ?? null
              : null,
            condition_value: (it.condition_value as string | null) ?? null,
          })),
        }
      }),
    }
  })

  // ── Preservation procedures ───────────────────────────
  const { data: presRaw, error: presErr } = await ctx.supabase
    .from('preservation_procedures')
    .select(`
      id, code, title, description, frequency, interval_days,
      requires_photo, requires_signature,
      disciplines(code),
      equipment_types(code),
      preservation_procedure_items(
        order_index, label, item_type, unit, min_value, max_value, is_critical, is_required
      )
    `)
    .eq('org_id', ctx.orgId)
    .order('code')

  if (presErr) return { error: `Preservation: ${presErr.message}` }

  const preservation_procedures: PreservationProcedureBackup[] = (presRaw ?? []).map(p => {
    const disc = p.disciplines as { code: string } | { code: string }[] | null
    const eqt = p.equipment_types as { code: string } | { code: string }[] | null
    const items = ([...(p.preservation_procedure_items ?? [])] as Array<Record<string, unknown>>)
      .sort((a, b) => ((a.order_index as number) ?? 0) - ((b.order_index as number) ?? 0))
    return {
      code: p.code as string,
      title: p.title as string,
      description: (p.description as string | null) ?? null,
      frequency: p.frequency as string,
      interval_days: p.interval_days as number,
      requires_photo: !!p.requires_photo,
      requires_signature: !!p.requires_signature,
      discipline_code: Array.isArray(disc) ? disc[0]?.code ?? null : disc?.code ?? null,
      equipment_type_code: Array.isArray(eqt) ? eqt[0]?.code ?? null : eqt?.code ?? null,
      items: items.map(it => ({
        order_index: (it.order_index as number) ?? 0,
        label: (it.label as string) ?? '',
        item_type: (it.item_type as string) ?? 'checkbox',
        unit: (it.unit as string | null) ?? null,
        min_value: (it.min_value as number | null) ?? null,
        max_value: (it.max_value as number | null) ?? null,
        is_critical: !!it.is_critical,
        is_required: !!it.is_required,
      })),
    }
  })

  // ── PSSR templates ────────────────────────────────────
  const { data: pssrRaw, error: pssrErr } = await ctx.supabase
    .from('pssr_templates')
    .select(`
      id, name, description, is_active,
      pssr_template_items(
        item_order, category, element, requirement, notes_hint, is_required
      )
    `)
    .eq('org_id', ctx.orgId)
    .order('name')

  if (pssrErr) return { error: `PSSR: ${pssrErr.message}` }

  const pssr_templates: PssrTemplateBackup[] = (pssrRaw ?? []).map(t => {
    const items = ([...(t.pssr_template_items ?? [])] as Array<Record<string, unknown>>)
      .sort((a, b) => ((a.item_order as number) ?? 0) - ((b.item_order as number) ?? 0))
    return {
      name: t.name as string,
      description: (t.description as string | null) ?? null,
      is_active: !!t.is_active,
      items: items.map(it => ({
        item_order: (it.item_order as number) ?? 0,
        category: (it.category as string) ?? '',
        element: (it.element as string) ?? '',
        requirement: (it.requirement as string) ?? '',
        notes_hint: (it.notes_hint as string | null) ?? null,
        is_required: !!it.is_required,
      })),
    }
  })

  const backup: TemplatesBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    org: { id: org.id as string, name: org.name as string, slug: (org.slug as string | null) ?? null },
    itr_templates,
    preservation_procedures,
    pssr_templates,
  }

  return { backup }
}

// Per-template / per-procedure helpers — same shape, single entry.

export async function exportItrTemplate(templateId: string): Promise<{
  backup?: TemplatesBackup
  error?: string
}> {
  const all = await exportAllTemplates()
  if (all.error || !all.backup) return { error: all.error ?? 'Error' }
  // We don't know the code from id without another query — instead, re-filter by id via fresh query.
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }
  const { data: row } = await ctx.supabase
    .from('itr_templates')
    .select('code')
    .eq('id', templateId)
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (!row) return { error: 'Template no encontrado' }
  const filtered = all.backup.itr_templates.filter(t => t.code === row.code)
  return {
    backup: { ...all.backup, itr_templates: filtered, preservation_procedures: [], pssr_templates: [] },
  }
}

export async function exportPreservationProcedure(procedureId: string): Promise<{
  backup?: TemplatesBackup
  error?: string
}> {
  const all = await exportAllTemplates()
  if (all.error || !all.backup) return { error: all.error ?? 'Error' }
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }
  const { data: row } = await ctx.supabase
    .from('preservation_procedures')
    .select('code')
    .eq('id', procedureId)
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (!row) return { error: 'Procedimiento no encontrado' }
  const filtered = all.backup.preservation_procedures.filter(p => p.code === row.code)
  return {
    backup: { ...all.backup, itr_templates: [], preservation_procedures: filtered, pssr_templates: [] },
  }
}

export async function exportPssrTemplate(templateId: string): Promise<{
  backup?: TemplatesBackup
  error?: string
}> {
  const all = await exportAllTemplates()
  if (all.error || !all.backup) return { error: all.error ?? 'Error' }
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }
  const { data: row } = await ctx.supabase
    .from('pssr_templates')
    .select('name')
    .eq('id', templateId)
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (!row) return { error: 'Template PSSR no encontrado' }
  const filtered = all.backup.pssr_templates.filter(t => t.name === row.name)
  return {
    backup: { ...all.backup, itr_templates: [], preservation_procedures: [], pssr_templates: filtered },
  }
}

// ═══════════════════════════════════════════════════════════
// PRE-FLIGHT TAXONOMY CHECK + AUTO-CREATE
// ═══════════════════════════════════════════════════════════

/**
 * Inspects a backup payload and reports which taxonomy codes (disciplines,
 * phases, equipment_types) referenced by the backup are missing in the active
 * org. Used before restore to surface issues like the HVAC/TELE case.
 */
export async function previewRestoreTaxonomy(
  payload: unknown
): Promise<{ preview?: TaxonomyPreview; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  if (!isValidBackup(payload)) return { error: 'Formato de backup inválido' }
  const backup = payload

  const neededDiscs = new Set<string>()
  const neededPhases = new Set<string>()
  const neededEqts = new Set<string>()

  for (const t of backup.itr_templates) {
    if (t.discipline_code) neededDiscs.add(t.discipline_code)
    if (t.phase_code) neededPhases.add(t.phase_code)
  }
  for (const p of backup.preservation_procedures) {
    if (p.discipline_code) neededDiscs.add(p.discipline_code)
    if (p.equipment_type_code) neededEqts.add(p.equipment_type_code)
  }
  // PSSR has no taxonomy refs.

  const [{ data: discRows }, { data: phaseRows }, { data: eqtRows }] = await Promise.all([
    ctx.supabase.from('disciplines').select('code').eq('org_id', ctx.orgId),
    ctx.supabase.from('project_phases').select('code').eq('org_id', ctx.orgId),
    ctx.supabase.from('equipment_types').select('code').eq('org_id', ctx.orgId),
  ])
  const haveDisc = new Set((discRows ?? []).map(r => r.code as string))
  const havePhase = new Set((phaseRows ?? []).map(r => r.code as string))
  const haveEqt = new Set((eqtRows ?? []).map(r => r.code as string))

  return {
    preview: {
      missingDisciplines: [...neededDiscs].filter(c => !haveDisc.has(c)).sort(),
      missingPhases: [...neededPhases].filter(c => !havePhase.has(c)).sort(),
      missingEquipmentTypes: [...neededEqts].filter(c => !haveEqt.has(c)).sort(),
    },
  }
}

/**
 * Bulk-creates missing taxonomy in the active org. Uses sensible defaults
 * (DISCIPLINE_DEFAULTS / PHASE_DEFAULTS) when the code is recognised; otherwise
 * falls back to name = code with a generic color. Equipment types use the code
 * as name and no category. order_index for phases is appended after existing.
 */
export async function createMissingTaxonomy(input: {
  disciplines?: string[]
  phases?: string[]
  equipmentTypes?: string[]
}): Promise<{
  created: { disciplines: number; phases: number; equipmentTypes: number }
  errors: string[]
}> {
  const ctx = await getCtx()
  if (!ctx) return { created: { disciplines: 0, phases: 0, equipmentTypes: 0 }, errors: ['Sin permisos'] }

  const errors: string[] = []
  const created = { disciplines: 0, phases: 0, equipmentTypes: 0 }

  // Disciplines
  if (input.disciplines && input.disciplines.length > 0) {
    const rows = input.disciplines.map(code => {
      const def = DISCIPLINE_DEFAULTS[code]
      return {
        org_id: ctx.orgId,
        code,
        name: def?.name ?? code,
        color: def?.color ?? DEFAULT_DISCIPLINE_COLOR,
      }
    })
    const { error, count } = await ctx.supabase
      .from('disciplines')
      .insert(rows, { count: 'exact' })
    if (error) errors.push(`Disciplinas: ${error.message}`)
    else created.disciplines = count ?? rows.length
  }

  // Phases — need order_index continuation
  if (input.phases && input.phases.length > 0) {
    const { data: existingPhases } = await ctx.supabase
      .from('project_phases')
      .select('order_index')
      .eq('org_id', ctx.orgId)
      .order('order_index', { ascending: false })
      .limit(1)
    let nextIdx = ((existingPhases?.[0]?.order_index as number | undefined) ?? -1) + 1

    const rows = input.phases.map(code => {
      const def = PHASE_DEFAULTS[code]
      const idx = def ? def.order_index : nextIdx++
      return {
        org_id: ctx.orgId,
        code,
        name: def?.name ?? code,
        color: def?.color ?? '#3B82F6',
        order_index: idx,
        certificate_name: def?.certificate_name ?? null,
      }
    })

    // Resolve order_index conflicts by remapping any duplicate to nextIdx.
    const seen = new Set<number>()
    for (const r of rows) {
      while (seen.has(r.order_index)) r.order_index = nextIdx++
      seen.add(r.order_index)
    }

    const { error, count } = await ctx.supabase
      .from('project_phases')
      .insert(rows, { count: 'exact' })
    if (error) errors.push(`Fases: ${error.message}`)
    else created.phases = count ?? rows.length
  }

  // Equipment types
  if (input.equipmentTypes && input.equipmentTypes.length > 0) {
    const rows = input.equipmentTypes.map(code => ({
      org_id: ctx.orgId,
      code,
      name: code,
      category: null,
    }))
    const { error, count } = await ctx.supabase
      .from('equipment_types')
      .insert(rows, { count: 'exact' })
    if (error) errors.push(`Equipment types: ${error.message}`)
    else created.equipmentTypes = count ?? rows.length
  }

  revalidatePath('/admin/templates/backup')
  revalidatePath('/admin/config')
  return { created, errors }
}

// ═══════════════════════════════════════════════════════════
// RESTORE
// ═══════════════════════════════════════════════════════════

function isValidBackup(obj: unknown): obj is TemplatesBackup {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (o.format !== BACKUP_FORMAT) return false
  if (typeof o.version !== 'number') return false
  if (!Array.isArray(o.itr_templates)) return false
  if (!Array.isArray(o.preservation_procedures)) return false
  if (!Array.isArray(o.pssr_templates)) return false
  return true
}

export async function restoreTemplatesBackup(
  payload: unknown,
  options: RestoreOptions = {}
): Promise<{ result?: RestoreResult; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Sin permisos' }

  if (!isValidBackup(payload)) return { error: 'Formato de backup inválido' }
  const backup = payload

  const skipDuplicates = options.skipDuplicates ?? true
  const suffix = options.duplicateSuffix ?? ' (restaurado)'
  const includeItr = options.includeItr ?? backup.itr_templates.length > 0
  const includePreservation = options.includePreservation ?? backup.preservation_procedures.length > 0
  const includePssr = options.includePssr ?? backup.pssr_templates.length > 0

  // ── Lookup tables for the active org ──────────────────
  const [{ data: discRows }, { data: phaseRows }, { data: eqtRows }] = await Promise.all([
    ctx.supabase.from('disciplines').select('id, code').eq('org_id', ctx.orgId),
    ctx.supabase.from('project_phases').select('id, code').eq('org_id', ctx.orgId),
    ctx.supabase.from('equipment_types').select('id, code').eq('org_id', ctx.orgId),
  ])
  const discByCode = new Map((discRows ?? []).map(d => [d.code as string, d.id as string]))
  const phaseByCode = new Map((phaseRows ?? []).map(p => [p.code as string, p.id as string]))
  const eqtByCode = new Map((eqtRows ?? []).map(e => [e.code as string, e.id as string]))

  const result: RestoreResult = {
    itr: { created: 0, skipped: 0, errors: [] },
    preservation: { created: 0, skipped: 0, errors: [] },
    pssr: { created: 0, skipped: 0, errors: [] },
  }

  // ── ITR templates ──────────────────────────────────────
  if (includeItr) {
    const { data: existingItr } = await ctx.supabase
      .from('itr_templates')
      .select('code')
      .eq('org_id', ctx.orgId)
    const existingItrCodes = new Set((existingItr ?? []).map(r => r.code as string))

    for (const t of backup.itr_templates) {
      try {
        if (!t.discipline_code || !discByCode.has(t.discipline_code)) {
          result.itr.errors.push(`${t.code}: falta disciplina "${t.discipline_code ?? '—'}" en la org activa`)
          result.itr.skipped++
          continue
        }
        if (!t.phase_code || !phaseByCode.has(t.phase_code)) {
          result.itr.errors.push(`${t.code}: falta fase "${t.phase_code ?? '—'}" en la org activa`)
          result.itr.skipped++
          continue
        }

        let code = t.code
        if (existingItrCodes.has(code)) {
          if (skipDuplicates) { result.itr.skipped++; continue }
          code = `${t.code}${suffix}`
          if (existingItrCodes.has(code)) {
            result.itr.errors.push(`${t.code}: código "${code}" ya existe — omitido`)
            result.itr.skipped++
            continue
          }
        }

        const { data: newTpl, error: tplErr } = await ctx.supabase
          .from('itr_templates')
          .insert({
            org_id: ctx.orgId,
            code,
            title: t.title,
            description: t.description,
            version: 1,
            is_active: t.is_active,
            is_global: false,
            discipline_id: discByCode.get(t.discipline_code)!,
            phase_id: phaseByCode.get(t.phase_code)!,
          })
          .select('id')
          .single()

        if (tplErr || !newTpl) {
          result.itr.errors.push(`${t.code}: ${tplErr?.message ?? 'sin id'}`)
          continue
        }

        // Insert sections + items, build a portable-key → newItemId map for condition rewiring.
        const newItemIdByKey = new Map<string, string>()

        const sections = [...t.sections].sort((a, b) => a.order_index - b.order_index)
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const sec = sections[sIdx]
          const { data: newSec, error: secErr } = await ctx.supabase
            .from('itr_template_sections')
            .insert({ template_id: newTpl.id, title: sec.title, order_index: sec.order_index })
            .select('id')
            .single()
          if (secErr || !newSec) {
            result.itr.errors.push(`${t.code}: sección "${sec.title}" — ${secErr?.message ?? 'error'}`)
            continue
          }

          const items = [...sec.items].sort((a, b) => a.order_index - b.order_index)
          if (items.length === 0) continue

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
            // condition_item_id rewired in second pass
          }))

          const { data: newItems, error: itErr } = await ctx.supabase
            .from('itr_template_items')
            .insert(rows)
            .select('id, order_index')

          if (itErr) {
            result.itr.errors.push(`${t.code}: items sección "${sec.title}" — ${itErr.message}`)
            continue
          }

          // Map portable keys: secIdx:iIdx → real id (match by order_index).
          if (newItems) {
            items.forEach((_origItem, iIdx) => {
              const matched = newItems.find(ni => ni.order_index === items[iIdx].order_index)
              if (matched) newItemIdByKey.set(`${sIdx}:${iIdx}`, matched.id as string)
            })
          }
        }

        // Rewire condition_item_id using portable keys.
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const items = [...sections[sIdx].items].sort((a, b) => a.order_index - b.order_index)
          for (let iIdx = 0; iIdx < items.length; iIdx++) {
            const condKey = items[iIdx].condition_key
            if (!condKey) continue
            const myId = newItemIdByKey.get(`${sIdx}:${iIdx}`)
            const targetId = newItemIdByKey.get(condKey)
            if (myId && targetId) {
              await ctx.supabase
                .from('itr_template_items')
                .update({ condition_item_id: targetId })
                .eq('id', myId)
            }
          }
        }

        result.itr.created++
        existingItrCodes.add(code)
      } catch (e) {
        result.itr.errors.push(`${t.code}: ${e instanceof Error ? e.message : 'error inesperado'}`)
      }
    }
  }

  // ── Preservation procedures ───────────────────────────
  if (includePreservation) {
    const { data: existingProc } = await ctx.supabase
      .from('preservation_procedures')
      .select('code')
      .eq('org_id', ctx.orgId)
    const existingProcCodes = new Set((existingProc ?? []).map(r => r.code as string))

    for (const p of backup.preservation_procedures) {
      try {
        if (p.discipline_code && !discByCode.has(p.discipline_code)) {
          result.preservation.errors.push(`${p.code}: falta disciplina "${p.discipline_code}" en la org activa`)
          result.preservation.skipped++
          continue
        }
        if (p.equipment_type_code && !eqtByCode.has(p.equipment_type_code)) {
          result.preservation.errors.push(`${p.code}: falta tipo de equipo "${p.equipment_type_code}" en la org activa`)
          result.preservation.skipped++
          continue
        }

        let code = p.code
        if (existingProcCodes.has(code)) {
          if (skipDuplicates) { result.preservation.skipped++; continue }
          code = `${p.code}${suffix}`
          if (existingProcCodes.has(code)) {
            result.preservation.errors.push(`${p.code}: código "${code}" ya existe — omitido`)
            result.preservation.skipped++
            continue
          }
        }

        const { data: newProc, error: procErr } = await ctx.supabase
          .from('preservation_procedures')
          .insert({
            org_id: ctx.orgId,
            code,
            title: p.title,
            description: p.description,
            frequency: p.frequency,
            interval_days: p.interval_days,
            requires_photo: p.requires_photo,
            requires_signature: p.requires_signature,
            discipline_id: p.discipline_code ? discByCode.get(p.discipline_code) ?? null : null,
            equipment_type_id: p.equipment_type_code ? eqtByCode.get(p.equipment_type_code) ?? null : null,
          })
          .select('id')
          .single()

        if (procErr || !newProc) {
          result.preservation.errors.push(`${p.code}: ${procErr?.message ?? 'sin id'}`)
          continue
        }

        if (p.items.length > 0) {
          const rows = p.items.map(it => ({
            procedure_id: newProc.id,
            order_index: it.order_index,
            label: it.label,
            item_type: it.item_type,
            unit: it.unit,
            min_value: it.min_value,
            max_value: it.max_value,
            is_critical: it.is_critical,
            is_required: it.is_required,
          }))
          const { error: itErr } = await ctx.supabase
            .from('preservation_procedure_items')
            .insert(rows)
          if (itErr) {
            result.preservation.errors.push(`${p.code}: items — ${itErr.message}`)
            continue
          }
        }

        result.preservation.created++
        existingProcCodes.add(code)
      } catch (e) {
        result.preservation.errors.push(`${p.code}: ${e instanceof Error ? e.message : 'error inesperado'}`)
      }
    }
  }

  // ── PSSR templates ────────────────────────────────────
  if (includePssr) {
    const { data: existingPssr } = await ctx.supabase
      .from('pssr_templates')
      .select('name')
      .eq('org_id', ctx.orgId)
    const existingPssrNames = new Set((existingPssr ?? []).map(r => r.name as string))

    for (const t of backup.pssr_templates) {
      try {
        let name = t.name
        if (existingPssrNames.has(name)) {
          if (skipDuplicates) { result.pssr.skipped++; continue }
          name = `${t.name}${suffix}`
          if (existingPssrNames.has(name)) {
            result.pssr.errors.push(`${t.name}: nombre "${name}" ya existe — omitido`)
            result.pssr.skipped++
            continue
          }
        }

        const { data: newTpl, error: tplErr } = await ctx.supabase
          .from('pssr_templates')
          .insert({
            org_id: ctx.orgId,
            name,
            description: t.description,
            is_active: t.is_active,
            created_by: ctx.userId,
          })
          .select('id')
          .single()

        if (tplErr || !newTpl) {
          result.pssr.errors.push(`${t.name}: ${tplErr?.message ?? 'sin id'}`)
          continue
        }

        if (t.items.length > 0) {
          const rows = t.items.map(it => ({
            template_id: newTpl.id,
            item_order: it.item_order,
            category: it.category,
            element: it.element,
            requirement: it.requirement,
            notes_hint: it.notes_hint,
            is_required: it.is_required,
          }))
          const { error: itErr } = await ctx.supabase
            .from('pssr_template_items')
            .insert(rows)
          if (itErr) {
            result.pssr.errors.push(`${t.name}: items — ${itErr.message}`)
            continue
          }
        }

        result.pssr.created++
        existingPssrNames.add(name)
      } catch (e) {
        result.pssr.errors.push(`${t.name}: ${e instanceof Error ? e.message : 'error inesperado'}`)
      }
    }
  }

  revalidatePath('/admin/templates')
  revalidatePath('/admin/templates/preservation')
  revalidatePath('/admin/templates/pssr')
  return { result }
}
