'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

// ── Create ITR Assignment ────────────────────────────────────────────

export async function createItrAssignment(input: {
  projectId: string
  tagId: string
  templateId: string
  subsystemId: string
  scheduledDate?: string
  inspectorId: string
}): Promise<{ itrId?: string; itrNumber?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos para asignar ITRs' }

  const { projectId, tagId, templateId, subsystemId, scheduledDate, inspectorId } = input

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

  const { error: assignErr } = await ctx.supabase
    .from('itr_assignments')
    .insert({ itr_id: itr.id, user_id: inspectorId, role: 'executor' })

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

  const { itrId, itemId, templateId, ...values } = input

  const { error } = await ctx.supabase
    .from('itr_responses')
    .upsert(
      {
        itr_id: itrId,
        item_id: itemId,
        value_text: values.valueText ?? null,
        value_numeric: values.valueNumeric ?? null,
        value_bool: values.valueBool ?? null,
        value_option: values.valueOption ?? null,
        remarks: values.remarks ?? null,
        is_passed: values.isPassed ?? null,
        responded_at: new Date().toISOString(),
        responded_by: ctx.userId,
      },
      { onConflict: 'itr_id,item_id' },
    )

  if (error) return { error: error.message }

  // Recalculate progress
  const [{ count: totalItems }, { count: doneItems }] = await Promise.all([
    ctx.supabase
      .from('itr_template_items')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId),
    ctx.supabase
      .from('itr_responses')
      .select('*', { count: 'exact', head: true })
      .eq('itr_id', itrId),
  ])

  const pct = totalItems ? Math.round(((doneItems ?? 0) / totalItems) * 100) : 0
  const newStatus = pct === 0 ? 'not_started' : pct >= 100 ? 'completed' : 'in_progress'

  await ctx.supabase
    .from('itrs')
    .update({ progress_pct: pct, status: newStatus })
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
  }

  revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/itrs`)
  return {}
}
