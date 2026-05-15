'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'

// ═══════════════════════════════════════════════════════════
// PROCEDURES
// ═══════════════════════════════════════════════════════════

export async function createProcedure(input: {
  code: string
  title: string
  description?: string
  disciplineId?: string
  frequency: string
  intervalDays: number
  requiresPhoto: boolean
  requiresSignature: boolean
}): Promise<{ data?: { id: string }; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { data, error } = await ctx.supabase
    .from('preservation_procedures')
    .insert({
      org_id: ctx.orgId,
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      discipline_id: input.disciplineId ?? null,
      frequency: input.frequency,
      interval_days: input.intervalDays,
      requires_photo: input.requiresPhoto,
      requires_signature: input.requiresSignature,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/admin/templates/preservation')
  return { data }
}

export async function updateProcedure(input: {
  procedureId: string
  code: string
  title: string
  description?: string
  disciplineId?: string
  frequency: string
  intervalDays: number
  requiresPhoto: boolean
  requiresSignature: boolean
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('preservation_procedures')
    .update({
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      discipline_id: input.disciplineId ?? null,
      frequency: input.frequency,
      interval_days: input.intervalDays,
      requires_photo: input.requiresPhoto,
      requires_signature: input.requiresSignature,
    })
    .eq('id', input.procedureId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/templates/preservation')
  revalidatePath(`/admin/templates/preservation/${input.procedureId}`)
  return {}
}

export async function deleteProcedure(procedureId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { count } = await ctx.supabase
    .from('preservation_plans')
    .select('id', { count: 'exact', head: true })
    .eq('procedure_id', procedureId)

  if ((count ?? 0) > 0) {
    return { error: `No se puede eliminar: ${count} plan(es) usan este procedimiento` }
  }

  const { error } = await ctx.supabase
    .from('preservation_procedures')
    .delete()
    .eq('id', procedureId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/templates/preservation')
  return {}
}

// ═══════════════════════════════════════════════════════════
// PROCEDURE ITEMS
// ═══════════════════════════════════════════════════════════

export async function upsertProcedureItem(input: {
  id?: string
  procedureId: string
  orderIndex: number
  label: string
  itemType: string
  unit?: string
  minValue?: number
  maxValue?: number
  isCritical: boolean
  isRequired: boolean
}): Promise<{ data?: { id: string }; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const payload = {
    procedure_id: input.procedureId,
    order_index: input.orderIndex,
    label: input.label.trim(),
    item_type: input.itemType,
    unit: input.unit?.trim() ?? null,
    min_value: input.minValue ?? null,
    max_value: input.maxValue ?? null,
    is_critical: input.isCritical,
    is_required: input.isRequired,
  }

  let data, error
  if (input.id) {
    ;({ data, error } = await ctx.supabase
      .from('preservation_procedure_items')
      .update(payload)
      .eq('id', input.id)
      .select('id')
      .single())
  } else {
    ;({ data, error } = await ctx.supabase
      .from('preservation_procedure_items')
      .insert(payload)
      .select('id')
      .single())
  }

  if (error) return { error: error.message }
  revalidatePath(`/admin/templates/preservation/${input.procedureId}`)
  return { data: data ?? undefined }
}

export async function deleteProcedureItem(itemId: string, procedureId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('preservation_procedure_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/templates/preservation/${procedureId}`)
  return {}
}

export async function reorderProcedureItems(
  procedureId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const updates = orderedIds.map((id, idx) =>
    ctx.supabase
      .from('preservation_procedure_items')
      .update({ order_index: idx })
      .eq('id', id)
  )

  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePath(`/admin/templates/preservation/${procedureId}`)
  return {}
}

// ═══════════════════════════════════════════════════════════
// PLANS
// ═══════════════════════════════════════════════════════════

export async function assignPreservationPlan(input: {
  tagId: string
  projectId: string
  procedureId: string
  startDate: string
  responsibleUserId?: string
}): Promise<{ data?: { id: string }; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  // Fetch interval_days from procedure
  const { data: proc, error: procErr } = await ctx.supabase
    .from('preservation_procedures')
    .select('interval_days')
    .eq('id', input.procedureId)
    .eq('org_id', ctx.orgId)
    .single()

  if (procErr || !proc) return { error: 'Procedimiento no encontrado' }

  // next_due_date = start_date + interval_days
  const start = new Date(input.startDate)
  const next = new Date(start)
  next.setDate(next.getDate() + proc.interval_days)

  const { data, error } = await ctx.supabase
    .from('preservation_plans')
    .insert({
      tag_id: input.tagId,
      project_id: input.projectId,
      procedure_id: input.procedureId,
      responsible_user_id: input.responsibleUserId ?? null,
      start_date: input.startDate,
      next_due_date: next.toISOString().split('T')[0],
      status: 'active',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  return { data }
}

export async function updatePlanStatus(
  planId: string,
  status: 'active' | 'suspended' | 'completed',
  projectId: string,
  tagId: string
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('preservation_plans')
    .update({ status })
    .eq('id', planId)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  return {}
}

// ═══════════════════════════════════════════════════════════
// RECORDS (EXECUTION)
// ═══════════════════════════════════════════════════════════

export async function createPreservationRecord(input: {
  planId: string
  tagId: string
  projectId: string
  result: 'ok' | 'nok' | 'na'
  remarks?: string
}): Promise<{ data?: { id: string }; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data, error } = await ctx.supabase
    .from('preservation_records')
    .insert({
      plan_id: input.planId,
      tag_id: input.tagId,
      performed_by: ctx.userId,
      performed_at: new Date().toISOString(),
      result: input.result,
      remarks: input.remarks?.trim() ?? null,
      punch_raised: false,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  return { data }
}

export async function upsertRecordResponse(input: {
  recordId: string
  itemId: string
  valueBool?: boolean
  valueNumeric?: number
  valueText?: string
  isPassed?: boolean
  projectId: string
  tagId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('preservation_record_responses')
    .upsert({
      record_id: input.recordId,
      item_id: input.itemId,
      value_bool: input.valueBool ?? null,
      value_numeric: input.valueNumeric ?? null,
      value_text: input.valueText ?? null,
      is_passed: input.isPassed ?? null,
      responded_at: new Date().toISOString(),
      responded_by: ctx.userId,
    }, { onConflict: 'record_id,item_id' })

  if (error) return { error: error.message }
  return {}
}

export async function finalizeRecord(input: {
  recordId: string
  planId: string
  result: 'ok' | 'nok' | 'na'
  remarks?: string
  raisePunch: boolean
  punchCategory?: 'A' | 'B' | 'C'
  projectId: string
  tagId: string
}): Promise<{ error?: string; punchNumber?: string; alreadyFinalized?: boolean }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  // Guard: si el record ya está finalizado, no permitir sobreescribir
  const { data: existing } = await ctx.supabase
    .from('preservation_records')
    .select('status')
    .eq('id', input.recordId)
    .single()

  if (existing?.status === 'finalized') {
    return { error: 'Este registro ya fue finalizado. Crea un nuevo record si necesitas re-evaluar.', alreadyFinalized: true }
  }

  const { error } = await ctx.supabase
    .from('preservation_records')
    .update({
      result: input.result,
      remarks: input.remarks?.trim() ?? null,
      punch_raised: input.raisePunch,
      status: 'finalized',
    })
    .eq('id', input.recordId)

  if (error) return { error: error.message }

  let createdPunchNumber: string | undefined

  if (input.raisePunch) {
    // Dedup: si ya hay punch vinculado a este record, no crear otro
    const { data: existingPunch } = await ctx.supabase
      .from('punches')
      .select('punch_number')
      .eq('preservation_record_id', input.recordId)
      .maybeSingle()

    if (existingPunch) {
      createdPunchNumber = existingPunch.punch_number as string
    } else {
      // Resolve tag → subsystem + discipline (required by punches schema)
      const { data: tag } = await ctx.supabase
        .from('tags')
        .select('tag_number, subsystem_id, discipline_id')
        .eq('id', input.tagId)
        .single()

      if (!tag || !tag.subsystem_id || !tag.discipline_id) {
        return { error: 'Record guardado pero no se pudo crear punch: tag sin subsistema o disciplina' }
      }

      // Resolve plan → procedure code for description
      const { data: plan } = await ctx.supabase
        .from('preservation_plans')
        .select('preservation_procedures(code, title)')
        .eq('id', input.planId)
        .single()

      const proc = plan?.preservation_procedures as { code: string; title: string } | { code: string; title: string }[] | null
      const procRow = Array.isArray(proc) ? proc[0] : proc
      const procCode = procRow?.code ?? 'PRES'
      const procTitle = procRow?.title ?? ''

      const description =
        `[Preservación NOK] ${procCode} en ${tag.tag_number}` +
        (procTitle ? ` — ${procTitle}` : '') +
        (input.remarks?.trim() ? `\n${input.remarks.trim()}` : '')

      const { data: punch, error: punchErr } = await ctx.supabase
        .from('punches')
        .insert({
          project_id: input.projectId,
          subsystem_id: tag.subsystem_id,
          tag_id: input.tagId,
          preservation_record_id: input.recordId,
          category: input.punchCategory ?? 'B',
          description,
          discipline_id: tag.discipline_id,
          raised_by: ctx.userId,
          status: 'open',
          priority: input.punchCategory === 'A' ? 'critical' : 'major',
          created_via: 'preservation',
        })
        .select('punch_number')
        .single()

      if (punchErr) {
        return { error: `Record guardado pero punch falló: ${punchErr.message}` }
      }
      createdPunchNumber = punch?.punch_number as string | undefined
    }
  }

  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/preservation/${input.planId}`)
  if (input.raisePunch) {
    revalidatePath(`/projects/${input.projectId}/punches`)
    revalidatePath('/punch-list')
  }
  return { punchNumber: createdPunchNumber }
}

// ═══════════════════════════════════════════════════════════
// CROSS-ORG SHARING (procedures only — plans/records live per project)
// ═══════════════════════════════════════════════════════════

export type ImportableProcedure = {
  id: string
  code: string
  title: string
  frequency: string
  intervalDays: number
  disciplineCode: string | null
  equipmentTypeCode: string | null
  sourceOrgId: string
  sourceOrgName: string
  sourceOrgIsCatalog: boolean
  itemCount: number
}

export async function listImportableProcedures(): Promise<{
  procedures: ImportableProcedure[]
  error?: string
}> {
  const ctx = await getCtx()
  if (!ctx) return { procedures: [], error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { procedures: [], error: 'Sin permisos' }

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
  if (otherOrgIds.length === 0) return { procedures: [] }

  const { data, error } = await ctx.supabase
    .from('preservation_procedures')
    .select(`
      id, code, title, frequency, interval_days, org_id,
      disciplines(code),
      equipment_types(code),
      preservation_procedure_items(id)
    `)
    .in('org_id', otherOrgIds)
    .order('code')

  if (error) return { procedures: [], error: error.message }

  const procedures: ImportableProcedure[] = (data ?? []).map(p => {
    const disc = p.disciplines as { code: string } | { code: string }[] | null
    const eqt = p.equipment_types as { code: string } | { code: string }[] | null
    const items = (p.preservation_procedure_items ?? []) as Array<{ id: string }>
    const info = orgInfo.get(p.org_id as string)
    return {
      id: p.id as string,
      code: p.code as string,
      title: p.title as string,
      frequency: p.frequency as string,
      intervalDays: p.interval_days as number,
      disciplineCode: Array.isArray(disc) ? disc[0]?.code ?? null : disc?.code ?? null,
      equipmentTypeCode: Array.isArray(eqt) ? eqt[0]?.code ?? null : eqt?.code ?? null,
      sourceOrgId: p.org_id as string,
      sourceOrgName: info?.name ?? '—',
      sourceOrgIsCatalog: info?.isCatalog ?? false,
      itemCount: items.length,
    }
  })

  return { procedures }
}

export async function cloneProcedureToActiveOrg(
  sourceProcedureId: string,
  options?: { codeSuffix?: string }
): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { data: source } = await ctx.supabase
    .from('preservation_procedures')
    .select(`
      id, code, title, description, frequency, interval_days,
      requires_photo, requires_signature, org_id,
      disciplines(code),
      equipment_types(code),
      preservation_procedure_items(
        order_index, label, item_type, unit, min_value, max_value, is_critical, is_required
      )
    `)
    .eq('id', sourceProcedureId)
    .single()

  if (!source) return { error: 'Procedimiento origen no encontrado o sin acceso' }
  if (source.org_id === ctx.orgId) return { error: 'El procedimiento ya está en la org activa' }

  const sourceDisc = source.disciplines as { code: string } | { code: string }[] | null
  const sourceEqt = source.equipment_types as { code: string } | { code: string }[] | null
  const discCode = Array.isArray(sourceDisc) ? sourceDisc[0]?.code : sourceDisc?.code
  const eqtCode = Array.isArray(sourceEqt) ? sourceEqt[0]?.code : sourceEqt?.code

  // Map discipline + equipment_type by code into target org (both optional in schema).
  const [{ data: targetDisc }, { data: targetEqt }] = await Promise.all([
    discCode
      ? ctx.supabase.from('disciplines').select('id').eq('org_id', ctx.orgId).eq('code', discCode).maybeSingle()
      : Promise.resolve({ data: null }),
    eqtCode
      ? ctx.supabase.from('equipment_types').select('id').eq('org_id', ctx.orgId).eq('code', eqtCode).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (discCode && !targetDisc) {
    return { error: `Falta la disciplina "${discCode}" en la org activa. Créala antes de importar.` }
  }
  if (eqtCode && !targetEqt) {
    return { error: `Falta el tipo de equipo "${eqtCode}" en la org activa. Créalo antes de importar.` }
  }

  const newCode = `${source.code}${options?.codeSuffix ?? ''}`

  const { data: existing } = await ctx.supabase
    .from('preservation_procedures')
    .select('id')
    .eq('org_id', ctx.orgId)
    .eq('code', newCode)
    .maybeSingle()

  if (existing) {
    return { error: `Ya existe un procedimiento con código "${newCode}" en esta org` }
  }

  const { data: cloned, error: procErr } = await ctx.supabase
    .from('preservation_procedures')
    .insert({
      org_id: ctx.orgId,
      code: newCode,
      title: source.title,
      description: source.description,
      frequency: source.frequency,
      interval_days: source.interval_days,
      requires_photo: source.requires_photo,
      requires_signature: source.requires_signature,
      discipline_id: targetDisc?.id ?? null,
      equipment_type_id: targetEqt?.id ?? null,
    })
    .select('id')
    .single()

  if (procErr || !cloned) return { error: procErr?.message ?? 'No se pudo crear el procedimiento' }

  const items = (source.preservation_procedure_items ?? []) as Array<Record<string, unknown>>
  if (items.length > 0) {
    const itemRows = items.map(item => ({ ...item, procedure_id: cloned.id }))
    const { error: itemErr } = await ctx.supabase
      .from('preservation_procedure_items')
      .insert(itemRows)
    if (itemErr) return { error: `Procedimiento clonado pero items fallaron: ${itemErr.message}` }
  }

  revalidatePath('/admin/templates/preservation')
  return { id: cloned.id }
}

// ═══════════════════════════════════════════════════════════
// PRESERVATION RECORD ATTACHMENTS
// ═══════════════════════════════════════════════════════════

export type PreservationAttachmentRow = {
  id: string
  file_url: string
  signed_url: string | null
  file_type: string
  captured_at: string
}

export async function listPreservationAttachments(input: {
  recordId: string
}): Promise<{ attachments?: PreservationAttachmentRow[]; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data: rows, error } = await ctx.supabase
    .from('preservation_attachments')
    .select('id, file_url, file_type, captured_at')
    .eq('record_id', input.recordId)
    .order('captured_at', { ascending: true })

  if (error) return { error: error.message }

  const attachments = await Promise.all(
    (rows ?? []).map(async row => {
      const { data: signed } = await ctx.supabase.storage
        .from('preservation-attachments')
        .createSignedUrl(row.file_url, 3600)
      return {
        id: row.id,
        file_url: row.file_url,
        signed_url: signed?.signedUrl ?? null,
        file_type: row.file_type,
        captured_at: row.captured_at,
      }
    })
  )

  return { attachments }
}

export async function addPreservationAttachment(input: {
  recordId: string
  storagePath: string
  fileType: string
  projectId: string
  tagId: string
  planId: string
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data, error } = await ctx.supabase
    .from('preservation_attachments')
    .insert({
      record_id: input.recordId,
      file_url: input.storagePath,
      file_type: input.fileType,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/preservation/${input.planId}`)
  return { id: data.id }
}

export async function deletePreservationAttachment(input: {
  attachmentId: string
  storagePath: string
  projectId: string
  tagId: string
  planId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error: storageError } = await ctx.supabase.storage
    .from('preservation-attachments')
    .remove([input.storagePath])
  if (storageError) return { error: storageError.message }

  const { error } = await ctx.supabase
    .from('preservation_attachments')
    .delete()
    .eq('id', input.attachmentId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/preservation/${input.planId}`)
  return {}
}
