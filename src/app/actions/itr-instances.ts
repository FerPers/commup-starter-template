'use server'

import { evaluateContinuity } from '@/lib/itr/continuity'
import { evaluateSelectionOutcome } from '@/lib/itr/selection-outcome'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { evaluateItrCompletion } from '@/lib/itr/completion'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import type { TablesInsert, TablesUpdate } from '@/types/supabase.generated'

// NOTA sobre roles: las funciones de EJECUCIÓN de campo (upsertResponse,
// saveItrAttachment, deleteItrAttachment, signItr) son auth-only a propósito —
// los inspectores ('inspector') ejecutan ITRs y NO están en EDITOR_ROLES.
// RLS (is_project_member) gobierna el acceso a itr_responses/attachments/signatures.

// ── Create ITR Assignment ────────────────────────────────────────────

export const createItrAssignment = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId' },
      { resource: 'subsystem', field: 'subsystemId', scopeField: 'projectId' },
      { resource: 'template', field: 'templateId' },
    ],
  },
  async (
    ctx,
    input: {
      projectId: string
      tagId: string
      templateId: string
      subsystemId: string
      scheduledDate?: string
      inspectorId: string
      supervisorId?: string
      clientId?: string
    },
  ): Promise<{ itrId?: string; itrNumber?: string; error?: string }> => {
    const { projectId, tagId, templateId, subsystemId, scheduledDate, inspectorId, supervisorId, clientId } = input

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

    const assignments: TablesInsert<'itr_assignments'>[] = [
      { itr_id: itr.id, user_id: inspectorId, role: 'executor' },
    ]
    if (supervisorId) assignments.push({ itr_id: itr.id, user_id: supervisorId, role: 'supervisor' })
    if (clientId) assignments.push({ itr_id: itr.id, user_id: clientId, role: 'client' })

    const { error: assignErr } = await ctx.supabase
      .from('itr_assignments')
      .insert(assignments)

    if (assignErr) return { error: assignErr.message }

    const changes: ItrAssignmentChange[] = assignments.map(a => ({
      itrId: itr.id,
      itrNumber,
      projectId,
      tagId,
      role: a.role as 'executor' | 'supervisor' | 'client',
      recipientUserId: a.user_id,
      changeType: 'added',
    }))
    const admin = createAdminClient()
    await notifyItrAssignmentChanged(admin, ctx.orgId, ctx.userId, changes)

    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/itrs`)
    return { itrId: itr.id, itrNumber }
  },
)

// ── Delete ITR ───────────────────────────────────────────────────────

export const deleteItr = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    itrId: string,
    projectId: string,
    tagId: string,
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('itrs').delete().eq('id', itrId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/itrs`)
    return {}
  },
)

// ── Upsert Response + recalc progress ────────────────────────────────
//
// Acepta un patch parcial: solo persistimos los campos presentes en `input`.
// Esto evita que un save de "remarks" pise value_numeric/is_passed en BD.
// Para measurements con acceptance, recomputamos is_passed server-side
// como red de seguridad si el cliente no lo manda.

export const upsertResponse = withAuth(
  {},
  async (
    ctx,
    input: {
      itrId: string
      itemId: string
      templateId: string
      valueText?: string | null
      valueNumeric?: number | null
      valueBool?: boolean | null
      valueOption?: string | null
      remarks?: string | null
      isPassed?: boolean | null
    },
  ): Promise<{ error?: string }> => {
    const { itrId, itemId } = input

    // Guard: ITR aprobado es inmutable. Sin este chequeo, upsertResponse recalcula
    // status al final y pisaría 'approved' con 'in_progress'/'completed' (bug ses15).
    const { data: itrRow, error: itrReadError } = await ctx.supabase
      .from('itrs')
      .select('status, template_id, project_id')
      .eq('id', itrId)
      .single()
    if (itrReadError || !itrRow) return { error: 'ITR no encontrado o no accesible' }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: access.error }
    const templateId = itrRow.template_id
    if (input.templateId !== templateId) {
      return { error: 'La revisión indicada no corresponde a este ITR' }
    }
    if (itrRow.status === 'approved') {
      return { error: 'Este ITR ya está aprobado y no puede modificarse' }
    }

    const { data: signedRows, error: signatureReadError } = await ctx.supabase
      .from('itr_signatures').select('id').eq('itr_id', itrId).limit(1)
    if (signatureReadError || !signedRows) return { error: 'No se pudo comprobar si el ITR está firmado' }
    if (signedRows.length > 0) return { error: 'Este ITR tiene firmas. Debe reabrirse con motivo antes de modificarlo' }

    // Resolve the item independently of the supplied template reference.
    const { data: item, error: itemReadError } = await ctx.supabase
      .from('itr_template_items')
      .select('template_id, item_type, acceptance_min, acceptance_max, options, option_outcomes')
      .eq('id', itemId)
      .single()
    if (itemReadError || !item || item.template_id !== templateId) {
      return { error: 'La casilla no pertenece a la revisión de este ITR o no está disponible' }
    }

    // Build patch with only the fields explicitly provided.
    const patch: TablesUpdate<'itr_responses'> = {
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
      if (item?.item_type === 'measurement' && (item.acceptance_min !== null || item.acceptance_max !== null)) {
        const v = input.valueNumeric
        const minOk = item.acceptance_min === null || v >= Number(item.acceptance_min)
        const maxOk = item.acceptance_max === null || v <= Number(item.acceptance_max)
        patch.is_passed = minOk && maxOk
      }
    }

    // UPDATE if response exists, INSERT otherwise. We don't use upsert because
    // upsert with partial fields would null-out the missing columns.
    const { data: existing, error: existingReadError } = await ctx.supabase
      .from('itr_responses')
      .select('id, value_option, value_text')
      .eq('itr_id', itrId)
      .eq('item_id', itemId)
      .maybeSingle()

    if (existingReadError) return { error: 'No se pudo comprobar la respuesta existente' }
    if (item.item_type === 'continuity') {
      const result = evaluateContinuity('valueText' in input ? input.valueText : existing?.value_text)
      if (!result.data) return { error: 'La estructura por conductores no es válida' }
      patch.is_passed = result.hasFail ? false : result.isComplete ? true : null
    }
    if (item.item_type === 'select') {
      const selected = 'valueOption' in input ? input.valueOption : existing?.value_option
      if (selected != null && (!Array.isArray(item.options) || !item.options.includes(selected))) {
        return { error: 'La opción no pertenece a esta casilla' }
      }
      patch.is_passed = evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, selected).isPassed
    }

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

    // Evaluate the assigned revision's applicable content, not response-row counts.
    const [itemsResult, responsesResult, attachmentsResult] = await Promise.all([
      ctx.supabase.from('itr_template_items').select('*').eq('template_id', templateId),
      ctx.supabase.from('itr_responses').select('*').eq('itr_id', itrId),
      ctx.supabase.from('itr_attachments').select('item_id, file_url, file_type').eq('itr_id', itrId),
    ])
    if (itemsResult.error || responsesResult.error || attachmentsResult.error
      || !itemsResult.data || !responsesResult.data || !attachmentsResult.data) {
      return { error: 'La respuesta se guardó, pero no se pudo comprobar el avance del ITR' }
    }
    const completion = evaluateItrCompletion(itemsResult.data, responsesResult.data, attachmentsResult.data)
    const applicableIds = new Set(completion.applicableItemIds)
    const criticalIds = new Set(itemsResult.data.filter(item => item.is_critical && applicableIds.has(item.id)).map(item => item.id))
    const hasCriticalFail = completion.rejectedItemIds.length > 0 || responsesResult.data.some(response => criticalIds.has(response.item_id) && response.is_passed === false)
    const newStatus = hasCriticalFail ? 'rejected'
      : completion.isComplete ? 'completed'
        : completion.completedCount > 0 ? 'in_progress' : 'not_started'

    const { error: progressError } = await ctx.supabase
      .from('itrs')
      .update({
        progress_pct: completion.progressPct,
        status: newStatus,
        completed_date: completion.isComplete && !hasCriticalFail ? new Date().toISOString() : null,
      })
      .eq('id', itrId)
    if (progressError) return { error: 'La respuesta se guardó, pero no se pudo actualizar el avance del ITR' }

    return {}
  },
)

// ── Upload ITR Attachment (save metadata after client-side storage upload) ──

export const saveItrAttachment = withAuth(
  {},
  async (
    ctx,
    input: {
      itrId: string
      itemId?: string | null
      storagePath: string
      fileType: string
      latitude?: number | null
      longitude?: number | null
      projectId: string
      tagId: string
    },
  ): Promise<{ id?: string; error?: string }> => {
    const { itrId, itemId, storagePath, fileType, latitude, longitude, projectId, tagId } = input

    const { data: itr, error: itrError } = await ctx.supabase.from('itrs')
      .select('template_id, project_id, tag_id, status').eq('id', itrId).single()
    if (itrError || !itr) return { error: 'ITR no encontrado' }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itr.project_id)
    if (!access.ok) return { error: access.error }
    if (itr.project_id !== projectId || itr.tag_id !== tagId) return { error: 'El ITR no corresponde al proyecto y tag indicados' }
    if (itr.status === 'approved') return { error: 'El ITR aprobado no puede modificarse' }
    const { data: signatures, error: signatureError } = await ctx.supabase.from('itr_signatures').select('id').eq('itr_id', itrId)
    if (signatureError || !signatures) return { error: 'No se pudieron verificar las firmas' }
    if (signatures.length > 0) return { error: 'El ITR tiene firmas; requiere reapertura antes de modificar evidencias' }

    if (itemId) {
      const { data: item, error: itemError } = await ctx.supabase.from('itr_template_items')
        .select('id').eq('id', itemId).eq('template_id', itr.template_id).maybeSingle()
      if (itemError || !item) return { error: 'El ítem no pertenece a la plantilla del ITR' }
    }
    if (!storagePath.trim() || !fileType.trim()) return { error: 'Falta la referencia o tipo de evidencia' }

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

    const [itemsResult, responsesResult, attachmentsResult] = await Promise.all([
      ctx.supabase.from('itr_template_items').select('*').eq('template_id', itr.template_id),
      ctx.supabase.from('itr_responses').select('*').eq('itr_id', itrId),
      ctx.supabase.from('itr_attachments').select('item_id, file_url, file_type').eq('itr_id', itrId),
    ])
    if (itemsResult.error || responsesResult.error || attachmentsResult.error || !itemsResult.data || !responsesResult.data || !attachmentsResult.data) {
      return { error: 'La evidencia cambió, pero no se pudo recalcular el avance; vuelve a intentarlo' }
    }
    const completion = evaluateItrCompletion(itemsResult.data, responsesResult.data, attachmentsResult.data)
    const applicable = new Set(completion.applicableItemIds)
    const critical = new Set(itemsResult.data.filter(item => item.is_critical && applicable.has(item.id)).map(item => item.id))
    const rejected = completion.rejectedItemIds.length > 0 || responsesResult.data.some(response => critical.has(response.item_id) && response.is_passed === false)
    const { error: progressError } = await ctx.supabase.from('itrs').update({
      progress_pct: completion.progressPct,
      status: rejected ? 'rejected' : completion.isComplete ? 'completed' : 'in_progress',
    }).eq('id', itrId)
    if (progressError) return { error: 'La evidencia cambió, pero no se pudo guardar el avance actualizado' }

    revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
    return { id: data.id }
  },
)

// ── Delete ITR Attachment ─────────────────────────────────────────────

export const deleteItrAttachment = withAuth(
  {},
  async (
    ctx,
    input: {
      attachmentId: string
      storagePath: string
      projectId: string
      tagId: string
      itrId: string
    },
  ): Promise<{ error?: string }> => {
    const { attachmentId, projectId, tagId, itrId } = input

    const { data: itr, error: itrError } = await ctx.supabase.from('itrs')
      .select('template_id, project_id, tag_id, status').eq('id', itrId).single()
    if (itrError || !itr) return { error: 'ITR no encontrado' }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itr.project_id)
    if (!access.ok) return { error: access.error }
    if (itr.project_id !== projectId || itr.tag_id !== tagId) return { error: 'El ITR no corresponde al proyecto y tag indicados' }
    if (itr.status === 'approved') return { error: 'El ITR aprobado no puede modificarse' }
    const { data: signatures, error: signatureError } = await ctx.supabase.from('itr_signatures').select('id').eq('itr_id', itrId)
    if (signatureError || !signatures) return { error: 'No se pudieron verificar las firmas' }
    if (signatures.length > 0) return { error: 'El ITR tiene firmas; requiere reapertura antes de modificar evidencias' }

    const { data: attachment, error: attachmentError } = await ctx.supabase.from('itr_attachments')
      .select('id, file_url').eq('id', attachmentId).eq('itr_id', itrId).single()
    if (attachmentError || !attachment) return { error: 'El adjunto no pertenece al ITR' }

    // Unlink metadata only. Evidence binaries are immutable: deleting the object
    // before this guarded write could destroy signed evidence during a race.
    // Unreferenced objects remain until a separate, retention-aware GC exists;
    // do not bypass the storage policy with a service-role removal here.
    const { error } = await ctx.supabase
      .from('itr_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('itr_id', itrId)
    if (error) return { error: error.message }

    const [itemsResult, responsesResult, attachmentsResult] = await Promise.all([
      ctx.supabase.from('itr_template_items').select('*').eq('template_id', itr.template_id),
      ctx.supabase.from('itr_responses').select('*').eq('itr_id', itrId),
      ctx.supabase.from('itr_attachments').select('item_id, file_url, file_type').eq('itr_id', itrId),
    ])
    if (itemsResult.error || responsesResult.error || attachmentsResult.error || !itemsResult.data || !responsesResult.data || !attachmentsResult.data) {
      return { error: 'La evidencia cambió, pero no se pudo recalcular el avance; vuelve a intentarlo' }
    }
    const completion = evaluateItrCompletion(itemsResult.data, responsesResult.data, attachmentsResult.data)
    const applicable = new Set(completion.applicableItemIds)
    const critical = new Set(itemsResult.data.filter(item => item.is_critical && applicable.has(item.id)).map(item => item.id))
    const rejected = completion.rejectedItemIds.length > 0 || responsesResult.data.some(response => critical.has(response.item_id) && response.is_passed === false)
    const { error: progressError } = await ctx.supabase.from('itrs').update({
      progress_pct: completion.progressPct,
      status: rejected ? 'rejected' : completion.isComplete ? 'completed' : 'in_progress',
    }).eq('id', itrId)
    if (progressError) return { error: 'La evidencia cambió, pero no se pudo guardar el avance actualizado' }

    revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
    return {}
  },
)

// ── Sign ITR ─────────────────────────────────────────────────────────

export const signItr = withAuthOnly(
  {},
  async (
    ctx,
    itrId: string,
    role: 'executor' | 'supervisor' | 'client',
    projectId: string,
    tagId: string,
    signatureImage?: string | null,
  ): Promise<{ error?: string }> => {
    const { data: itrRow, error: itrError } = await ctx.supabase.from('itrs')
      .select('project_id, tag_id').eq('id', itrId).single()
    if (itrError || !itrRow) return { error: 'ITR no encontrado' }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: access.error }
    if (itrRow.project_id !== projectId || itrRow.tag_id !== tagId) return { error: 'El ITR no corresponde al proyecto y tag indicados' }
    if (!(['executor', 'supervisor', 'client'] as const).includes(role)) return { error: 'Rol de firma no válido' }

    // Database transaction owns content validation, assignment order, audit and approval.
    const { error } = await ctx.supabase.rpc('sign_itr_atomic', {
      p_itr_id: itrId, p_role: role, p_signature_image: signatureImage ?? null,
    })
    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/itrs`)
    return {}
  },
)

// ── Revoke ITR Approval ──────────────────────────────────────────────

export const revokeItrApproval = withAuth(
  {
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      itrId: string
      projectId: string
      tagId: string
      reason: string
    },
  ): Promise<{ error?: string; revokedCount?: number }> => {
    const reason = (input.reason ?? '').trim()
    if (reason.length < 3) {
      return { error: 'Debes indicar un motivo (al menos 3 caracteres)' }
    }

    const { itrId, projectId, tagId } = input

    const { data: itrRow, error: itrReadError } = await ctx.supabase.from('itrs')
      .select('project_id, tag_id').eq('id', itrId).single()
    if (itrReadError || !itrRow) return { error: 'ITR no encontrado' }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: access.error }
    if (itrRow.project_id !== projectId || itrRow.tag_id !== tagId) return { error: 'El ITR no corresponde al proyecto y tag indicados' }
    const { data, error } = await ctx.supabase.rpc('reopen_itr_atomic', { p_itr_id: itrId, p_reason: reason })
    if (error) return { error: error.message }
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || typeof data.revoked_count !== 'number' || !Array.isArray(data.previous_signatures)) {
      return { error: 'La reapertura respondió sin detalle verificable; actualiza el ITR antes de continuar' }
    }
    const revokedCount = data.revoked_count
    const itrNumber = typeof data.itr_number === 'string' ? data.itr_number : ''
    const signers = data.previous_signatures.flatMap(signature =>
      signature && typeof signature === 'object' && !Array.isArray(signature) && typeof signature.user_id === 'string'
        ? [{ user_id: signature.user_id }] : [],
    )

    // Notify each signer (dedupe by user — a user could in theory have signed
    // more than one role, though UNIQUE(itr_id, role) and one-user-per-cert
    // make this rare).
    const uniqueRecipients = Array.from(new Set(signers.map(s => s.user_id))).filter(
      uid => uid && uid !== ctx.userId,
    )

    if (uniqueRecipients.length > 0) {
      const rows = uniqueRecipients.map(uid => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'itr_signature_revoked',
        title: `Tu firma en el ITR ${itrNumber} fue revocada`,
        body: reason,
        link_url: `/projects/${projectId}/tags/${tagId}/itrs/${itrId}`,
        payload: { itrId, projectId, tagId, itrNumber: itrNumber, reason },
      }))
      // Admin client: notifications are fire-and-forget and the user's RLS
      // context can't INSERT rows for other recipients across orgs.
      try {
        const admin = createAdminClient()
        const { error: notifErr } = await admin.from('notifications').insert(rows)
        if (notifErr) console.error('[notifications.insert]', notifErr)
      } catch (notificationError) {
        // The transaction already succeeded; a notification failure must not invite a second revocation.
        console.error('[notifications.insert]', notificationError)
      }
    }

    revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/itrs`)
    return { revokedCount }
  },
)
