'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']
const ADMIN_ROLES = ['owner', 'admin', 'architect']

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

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

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
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
  projectId: string
  tagId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('preservation_records')
    .update({
      result: input.result,
      remarks: input.remarks?.trim() ?? null,
      punch_raised: input.raisePunch,
    })
    .eq('id', input.recordId)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/preservation/${input.planId}`)
  return {}
}
