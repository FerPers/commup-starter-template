'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

// ── Create ITR Assignment ────────────────────────────────────────────

export async function createItrAssignment(input: {
  projectId: string
  tagId: string
  templateId: string
  subsystemId: string
  scheduledDate?: string
  inspectorId: string
  supervisorId?: string
  clientId?: string
}): Promise<{ itrId?: string; itrNumber?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos para asignar ITRs' }

  const { projectId, tagId, templateId, subsystemId, scheduledDate, inspectorId, supervisorId, clientId } = input

  // Verify project belongs to user's org
  const { data: project } = await ctx.supabase
    .from('projects')
    .select('org_id')
    .eq('id', projectId)
    .single()
  if (!project || project.org_id !== ctx.orgId) return { error: 'Proyecto no encontrado' }

  const [{ data: tag }, { data: template }] = await Promise.all([
    ctx.supabase.from('tags').select('tag_number').eq('id', tagId).single(),
    ctx.supabase.from('itr_templates').select('code, phase_id').eq('id', templateId).single(),
  ])

  if (!tag) return { error: 'Tag no encontrado' }
  if (!template) return { error: 'Template no encontrado' }

  const baseNumber = `${template.code}/${tag.tag_number}`

  const { count } = await ctx.supabase
    .from('itrs')
    .select('*', { count: 'exact', head: true })
    .eq('tag_id', tagId)
    .eq('template_id', templateId)

  const itrNumber = (count ?? 0) === 0
    ? baseNumber
    : `${baseNumber} R${(count ?? 0) + 1}`

  const { data: itr, error: itrErr } = await ctx.supabase
    .from('itrs')
    .insert({
      template_id: templateId,
      tag_id: tagId,
      subsystem_id: subsystemId,
      project_id: projectId,
      phase_id: template.phase_id,
      itr_number: itrNumber,
      status: 'not_started',
      scheduled_date: scheduledDate ?? null,
      progress_pct: 0,
    })
    .select('id')
    .single()

  if (itrErr) return { error: itrErr.message }

  const assignments: { itr_id: string; user_id: string; role: string }[] = [
    { itr_id: itr.id, user_id: inspectorId, role: 'executor' },
  ]
  if (supervisorId) assignments.push({ itr_id: itr.id, user_id: supervisorId, role: 'supervisor' })
  if (clientId) assignments.push({ itr_id: itr.id, user_id: clientId, role: 'client' })

  const { error: assignErr } = await ctx.supabase
    .from('itr_assignments')
    .insert(assignments)

  if (assignErr) return { error: assignErr.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/itrs`)
  return { itrId: itr.id, itrNumber }
}

// ── Delete ITR ───────────────────────────────────────────────────────

export async function deleteItr(
  itrId: string,
  projectId: string,
  tagId: string,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.from('itrs').delete().eq('id', itrId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/itrs`)
  return {}
}

// ── Upsert Response + recalc progress ────────────────────────────────
//
// Acepta un patch parcial: solo persistimos los campos presentes en `input`.
// Esto evita que un save de "remarks" pise value_numeric/is_passed en BD.
// Para measurements con acceptance, recomputamos is_passed server-side
// como red de seguridad si el cliente no lo manda.

export async function upsertResponse(input: {
  itrId: string
  itemId: string
  templateId: string
  valueText?: string | null
  valueNumeric?: number | null
  valueBool?: boolean | null
  valueOption?: string | null
  remarks?: string | null
  isPassed?: boolean | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { itrId, itemId, templateId } = input

  // Build patch with only the fields explicitly provided.
  const patch: Record<string, unknown> = {
    responded_at: new Date().toISOString(),
    responded_by: ctx.userId,
  }
  if ('valueText'    in input) patch.value_text    = input.valueText
  if ('valueNumeric' in input) patch.value_numeric = input.valueNumeric
  if ('valueBool'    in input) patch.value_bool    = input.valueBool
  if ('valueOption'  in input) patch.value_option  = input.valueOption
  if ('remarks'      in input) patch.remarks       = input.remarks
  if ('isPassed'     in input) patch.is_passed     = input.isPassed

  // Defensive: if a numeric value is being set on a measurement item with
  // acceptance bounds, recompute is_passed server-side regardless of client.
  if ('valueNumeric' in input && input.valueNumeric !== null && input.valueNumeric !== undefined) {
    const { data: item } = await ctx.supabase
      .from('itr_template_items')
      .select('item_type, acceptance_min, acceptance_max')
      .eq('id', itemId)
      .single()
    if (item?.item_type === 'measurement' && (item.acceptance_min !== null || item.acceptance_max !== null)) {
      const v = input.valueNumeric
      const minOk = item.acceptance_min === null || v >= Number(item.acceptance_min)
      const maxOk = item.acceptance_max === null || v <= Number(item.acceptance_max)
      patch.is_passed = minOk && maxOk
    }
  }

  // UPDATE if response exists, INSERT otherwise. We don't use upsert because
  // upsert with partial fields would null-out the missing columns.
  const { data: existing } = await ctx.supabase
    .from('itr_responses')
    .select('id')
    .eq('itr_id', itrId)
    .eq('item_id', itemId)
    .maybeSingle()

  if (existing) {
    const { error } = await ctx.supabase
      .from('itr_responses')
      .update(patch)
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await ctx.supabase
      .from('itr_responses')
      .insert({ itr_id: itrId, item_id: itemId, ...patch })
    if (error) return { error: error.message }
  }

  // Recalculate progress + status (with rejected-on-critical-fail logic).
  const [
    { count: totalItems },
    { count: doneItems },
    { data: criticalFails },
  ] = await Promise.all([
    ctx.supabase
      .from('itr_template_items')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId),
    ctx.supabase
      .from('itr_responses')
      .select('*', { count: 'exact', head: true })
      .eq('itr_id', itrId),
    ctx.supabase
      .from('itr_responses')
      .select('item_id, itr_template_items!inner(is_critical)')
      .eq('itr_id', itrId)
      .eq('is_passed', false)
      .eq('itr_template_items.is_critical', true)
      .limit(1),
  ])

  const pct = totalItems ? Math.round(((doneItems ?? 0) / totalItems) * 100) : 0
  const hasCriticalFail = (criticalFails?.length ?? 0) > 0

  let newStatus: 'not_started' | 'in_progress' | 'completed' | 'rejected'
  if (pct === 0) newStatus = 'not_started'
  else if (pct < 100) newStatus = 'in_progress'
  else newStatus = hasCriticalFail ? 'rejected' : 'completed'

  await ctx.supabase
    .from('itrs')
    .update({
      progress_pct: pct,
      status: newStatus,
      completed_date: pct >= 100 ? new Date().toISOString() : null,
    })
    .eq('id', itrId)

  return {}
}

// ── Upload ITR Attachment (save metadata after client-side storage upload) ──

export async function saveItrAttachment(input: {
  itrId: string
  itemId?: string | null
  storagePath: string
  fileType: string
  latitude?: number | null
  longitude?: number | null
  projectId: string
  tagId: string
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { itrId, itemId, storagePath, fileType, latitude, longitude, projectId, tagId } = input

  const { data, error } = await ctx.supabase
    .from('itr_attachments')
    .insert({
      itr_id: itrId,
      item_id: itemId ?? null,
      file_url: storagePath,
      file_type: fileType,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      captured_at: new Date().toISOString(),
      uploaded_by: ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
  return { id: data.id }
}

// ── Delete ITR Attachment ─────────────────────────────────────────────

export async function deleteItrAttachment(input: {
  attachmentId: string
  storagePath: string
  projectId: string
  tagId: string
  itrId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { attachmentId, storagePath, projectId, tagId, itrId } = input

  // Delete from storage
  const { error: storageError } = await ctx.supabase.storage
    .from('itr-attachments')
    .remove([storagePath])
  if (storageError) return { error: storageError.message }

  // Delete DB record
  const { error } = await ctx.supabase
    .from('itr_attachments')
    .delete()
    .eq('id', attachmentId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
  return {}
}

// ── Sign ITR ─────────────────────────────────────────────────────────

export async function signItr(
  itrId: string,
  role: 'executor' | 'supervisor' | 'client',
  projectId: string,
  tagId: string,
  signatureImage?: string | null,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data: existing } = await ctx.supabase
    .from('itr_signatures')
    .select('id')
    .eq('itr_id', itrId)
    .eq('role', role)
    .maybeSingle()

  if (existing) return { error: `Ya firmado como ${role}` }

  const { error } = await ctx.supabase
    .from('itr_signatures')
    .insert({ itr_id: itrId, user_id: ctx.userId, role, signature_image: signatureImage ?? null })

  if (error) return { error: error.message }

  // Check if all 3 roles signed → approved
  const { count } = await ctx.supabase
    .from('itr_signatures')
    .select('*', { count: 'exact', head: true })
    .eq('itr_id', itrId)

  if ((count ?? 0) >= 3) {
    await ctx.supabase.from('itrs').update({ status: 'approved' }).eq('id', itrId)
    // Auto-complete any work plan items that reference this ITR
    await ctx.supabase
      .from('work_plan_items')
      .update({ status: 'completed' })
      .eq('itr_id', itrId)
      .in('status', ['not_started', 'in_progress'])

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      entityType: 'itr',
      entityId: itrId,
      action: 'approved',
      payload: { projectId, tagId, signingRole: role },
    })
  }

  revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/itrs`)
  return {}
}
