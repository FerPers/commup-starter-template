'use server'

import { continuityMeasurementRequired, continuityScopeFromRow, evaluateContinuity } from '@/lib/itr/continuity'
import { evaluateTable, parseSourceRows } from '@/lib/itr/table'
import { evaluateSelectionOutcome } from '@/lib/itr/selection-outcome'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess, notFound } from '@/lib/auth/access'
import { accessError } from '@/lib/i18n/action-errors'
import { getTranslations } from 'next-intl/server'
import { assignmentIssue, requiredForTemplate, type SigningRole } from '@/lib/itr/signatures'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import type { TablesUpdate } from '@/types/supabase.generated'
import type { ResponseConflict } from '@/lib/sync/response-utils'
import type { ActiveContext } from '@/lib/supabase/membership'
import { createItrRecord, isRequestId } from '@/lib/itr/create'
import { measurementPassed } from '@/lib/itr/completion'
import { logActivity } from '@/lib/log-activity'
import { fromJson, sqlArg } from '@/lib/supabase/casts'

// NOTA sobre roles: las funciones de EJECUCIÓN de campo (upsertResponse,
// saveItrAttachment, deleteItrAttachment, signItr) son auth-only a propósito —
// los inspectores ('inspector') ejecutan ITRs y NO están en EDITOR_ROLES.
// RLS (is_project_member) gobierna el acceso a itr_responses/attachments/signatures.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * C-26 (S05): captura el ejecutor asignado o un supervisor (leader+); antes cualquier inspector o líder del
 * proyecto llenaba cualquier ITR y solo la firma exigía la asignación.
 */
async function captureBlocker(ctx: { supabase: ActiveContext['supabase']; userId: string; role: string }, itrId: string): Promise<string | null> {
  const t = await getTranslations('ActionErrors')
  if (EDITOR_ROLES.includes(ctx.role)) return null
  const { data } = await ctx.supabase.from('itr_assignments').select('id').eq('itr_id', itrId).eq('role', 'executor').eq('user_id', ctx.userId).maybeSingle()
  return data ? null : t('itrInstances.captureNotAssigned')
}

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
      /** A03: UUID que genera el formulario al abrirse; es el id del ITR (reintentar no duplica). */
      requestId?: string
    },
  ): Promise<{ itrId?: string; itrNumber?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { projectId, tagId, templateId, subsystemId, scheduledDate, inspectorId, supervisorId, clientId } = input
    if (input.requestId !== undefined && !isRequestId(input.requestId)) return { error: t('itrInstances.invalidRequest') }
    const requestId = input.requestId ?? crypto.randomUUID()

    const [{ data: tag }, { data: template }] = await Promise.all([
      ctx.supabase.from('tags').select('tag_number, subsystem_id').eq('id', tagId).single(),
      ctx.supabase.from('itr_templates').select('code, phase_id, is_active, required_signatures, project_phases(itr_client_signature)').eq('id', templateId).single(),
    ])

    if (!tag) return { error: t('itrInstances.tagNotFound') }
    if (!template) return { error: t('itrInstances.templateNotFound') }
    // C-40 (S05): plantilla activa, subsistema del tag y un ejecutor que no sea el cliente.
    if (!template.is_active) return { error: t('itrInstances.templateDraft') }
    if (tag.subsystem_id !== subsystemId) return { error: t('itrInstances.subsystemMismatch') }
    const { data: executorMember } = await ctx.supabase.from('org_members').select('role').eq('org_id', ctx.orgId).eq('user_id', inspectorId).maybeSingle()
    if (!executorMember) return { error: t('itrInstances.executorNotMember') }
    if (executorMember.role === 'client') return { error: t('itrInstances.clientExecutor') }

    // S04 (D4/D6): la BD congela estas firmas en el ITR; aquí se exige una persona distinta por rol requerido.
    const required = requiredForTemplate(template.required_signatures, template.project_phases?.itr_client_signature)
    const people: Record<SigningRole, string | undefined> = { executor: inspectorId, supervisor: supervisorId, client: clientId }
    const invalid = assignmentIssue(required, people)
    if (invalid) return { error: t(`itrAssign.${invalid.code}`, invalid) }

    // S05 (C-15): se manda la base; si ya existe, la BD agrega « Rn» de forma atómica (assign_itr_number).
    // A03: ITR y firmantes en una transacción; `requestId` = id del ITR, repetir la solicitud devuelve el mismo.
    const signers = Object.fromEntries(required.map(role => [role, people[role]!]))
    const res = await createItrRecord(ctx.supabase, {
      id: requestId, projectId, tagId, subsystemId, templateId, baseNumber: `${template.code}/${tag.tag_number}`,
      signers, scheduledDate: scheduledDate ?? null,
    })
    if ('error' in res) return { error: res.error }
    const itrNumber = res.itr_number
    if (!res.created) return { itrId: res.id, itrNumber }

    const changes: ItrAssignmentChange[] = required.map(role => ({
      itrId: res.id,
      itrNumber,
      projectId,
      tagId,
      role,
      recipientUserId: people[role]!,
      changeType: 'added',
    }))
    const admin = createAdminClient()
    await notifyItrAssignmentChanged(admin, ctx.orgId, ctx.userId, changes)

    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/itrs`)
    return { itrId: res.id, itrNumber }
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
    const t = await getTranslations('ActionErrors')
    // C-27 (S08): un ITR firmado no se borra (guard); antes la UI ignoraba el error. Se informa y se audita.
    const { data: deleted, error } = await ctx.supabase.from('itrs').delete().eq('id', itrId).eq('project_id', projectId).select('id, itr_number')
    if (error) return { error: /signed ITR/i.test(error.message) ? t('itrInstances.deleteSigned') : error.message }
    if (!deleted?.length) return { error: t('itrInstances.deleteFailed') }
    // A09: el borrado ya ocurrió; la auditoría revisa su error y no se pierde en silencio.
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, entityType: 'itr', entityId: itrId, action: 'deleted',
      payload: { itrNumber: deleted[0].itr_number, projectId, tagId },
    })

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
      /** S18 (C-35): hora de captura en campo (ISO); la BD la acota a [creación del ITR, now()]. */
      capturedAt?: string
      /**
       * S18 (B-16, decisión de Luis): versión de la fila (`responded_at`) que vio el dispositivo; null = no había
       * respuesta. Si viene y la fila cambió, no se escribe y se devuelve `conflict` (decide el usuario).
       * Ausente = sin comprobación (guardado en línea o «Aplicar la mía»).
       */
      expectedRespondedAt?: string | null
    },
  ): Promise<{
    error?: string
    conflict?: ResponseConflict
    respondedAt?: string
    /** C-19: lo que la BD dejó tras guardar, para que la pantalla no recargue la página entera. */
    isPassed?: boolean | null
    status?: string
    progressPct?: number
  }> => {
    const t = await getTranslations('ActionErrors')
    const { itrId, itemId } = input

    // B-15: todas las lecturas en un solo viaje (antes eran seis secuenciales); nada se escribe hasta validar.
    const responseCols = 'id, value_option, value_text, value_numeric, value_bool, remarks, is_passed, responded_at, responded_by'
    const [itrRes, signaturesRes, itemRes, existingRes, scopeRes, assignmentRes] = await Promise.all([
      ctx.supabase.from('itrs').select('status, template_id, project_id, source_rows, projects!inner(org_id)').eq('id', itrId).single(),
      ctx.supabase.from('itr_signatures').select('id').eq('itr_id', itrId).limit(1),
      ctx.supabase.from('itr_template_items')
        .select('template_id, item_type, acceptance_min, acceptance_max, options, option_outcomes')
        .eq('id', itemId).single(),
      ctx.supabase.from('itr_responses').select(responseCols).eq('itr_id', itrId).eq('item_id', itemId).maybeSingle(),
      // A38: alcance de continuidad fijado por el líder (solo cuenta para continuidad; 0 o 1 fila).
      ctx.supabase.from('itr_continuity_scopes').select('grouping_mode, quantity, shields').eq('itr_id', itrId).eq('item_id', itemId).maybeSingle(),
      EDITOR_ROLES.includes(ctx.role)
        ? Promise.resolve({ data: { id: 'editor' } })
        : ctx.supabase.from('itr_assignments').select('id').eq('itr_id', itrId).eq('role', 'executor').eq('user_id', ctx.userId).maybeSingle(),
    ])

    // Guard: ITR aprobado es inmutable. Sin este chequeo, upsertResponse recalcula
    // status al final y pisaría 'approved' con 'in_progress'/'completed' (bug ses15).
    const itrRow = itrRes.data
    if (itrRes.error || !itrRow) return { error: t('itrInstances.itrNotAccessible') }
    // Mismo guard que checkProjectAccess, embebido en la lectura del ITR.
    if (itrRow.projects?.org_id !== ctx.orgId) return { error: await accessError(notFound('project')) }
    const templateId = itrRow.template_id
    const sourceRows = parseSourceRows(itrRow.source_rows)
    if (input.templateId !== templateId) {
      return { error: t('itrInstances.revisionMismatch') }
    }
    if (itrRow.status === 'approved') {
      return { error: t('itrInstances.itrApproved') }
    }
    if (!assignmentRes.data) return { error: t('itrInstances.captureNotAssigned') }

    const signedRows = signaturesRes.data
    if (signaturesRes.error || !signedRows) return { error: t('itrInstances.signatureCheckFailed') }
    if (signedRows.length > 0) return { error: t('itrInstances.itrSigned') }

    // Resolve the item independently of the supplied template reference.
    const item = itemRes.data
    if (itemRes.error || !item || item.template_id !== templateId) {
      return { error: t('itrInstances.itemNotInRevision') }
    }

    // Build patch with only the fields explicitly provided.
    // responded_at / responded_by los fija la BD (trigger itr_response_times, S18); captured_at se acota allí.
    const patch: TablesUpdate<'itr_responses'> = {
      responded_by: ctx.userId,
      captured_at: input.capturedAt ?? new Date().toISOString(),
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
      // A29: la misma regla que evaluate_itr_capture (measurementPassed).
      const passed = item ? measurementPassed(item, input.valueNumeric) : null
      if (passed !== null) patch.is_passed = passed
    }

    // UPDATE if response exists, INSERT otherwise. We don't use upsert because
    // upsert with partial fields would null-out the missing columns.
    const existing = existingRes.data
    if (existingRes.error) return { error: t('itrInstances.responseCheckFailed') }
    if (item.item_type === 'continuity') {
      const result = evaluateContinuity('valueText' in input ? input.valueText : existing?.value_text, continuityScopeFromRow(scopeRes.data), continuityMeasurementRequired(item.options))
      if (!result.data) return { error: t('itrInstances.continuityInvalid') }
      patch.is_passed = result.hasFail ? false : result.isComplete ? true : null
    }
    if (item.item_type === 'table') {
      const result = evaluateTable(item.options, 'valueText' in input ? input.valueText : existing?.value_text, sourceRows)
      if (!result.config) return { error: t('itrInstances.tableConfigInvalid') }
      if (('valueText' in input ? input.valueText : existing?.value_text) && !result.data) return { error: t('itrInstances.tableRecordInvalid') }
      patch.is_passed = result.hasFail ? false : result.isComplete ? true : null
    }
    if (item.item_type === 'select') {
      const selected = 'valueOption' in input ? input.valueOption : existing?.value_option
      if (selected != null && (!Array.isArray(item.options) || !item.options.includes(selected))) {
        return { error: t('itrInstances.optionInvalid') }
      }
      patch.is_passed = evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, selected).isPassed
    }

    const checkVersion = 'expectedRespondedAt' in input && input.expectedRespondedAt !== undefined
    const conflictFrom = (row: NonNullable<typeof existing>): { conflict: ResponseConflict } => ({ conflict: {
      respondedAt: row.responded_at, respondedBy: row.responded_by,
      valueText: row.value_text, valueNumeric: row.value_numeric, valueBool: row.value_bool, valueOption: row.value_option,
      remarks: row.remarks, isPassed: row.is_passed,
    } })
    const reread = async () => (await ctx.supabase.from('itr_responses')
      .select(responseCols).eq('itr_id', itrId).eq('item_id', itemId).maybeSingle()).data

    let respondedAt: string | null = null
    let isPassed: boolean | null = null
    if (existing) {
      if (checkVersion && input.expectedRespondedAt === null) return conflictFrom(existing) // alguien la creó después
      let q = ctx.supabase.from('itr_responses').update(patch).eq('id', existing.id)
      // Compare-and-set en el mismo UPDATE: si otra escritura cambió la fila, no toca nada.
      if (checkVersion) q = q.eq('responded_at', input.expectedRespondedAt as string)
      const { data: written, error } = await q.select('responded_at, is_passed')
      if (error) return { error: error.message }
      if (checkVersion && !written?.length) {
        const now = await reread()
        return now ? conflictFrom(now) : { error: t('itrInstances.responseGone') }
      }
      respondedAt = written?.[0]?.responded_at ?? null
      isPassed = written?.[0]?.is_passed ?? null
    } else {
      const { data: written, error } = await ctx.supabase
        .from('itr_responses')
        .insert({ itr_id: itrId, item_id: itemId, ...patch })
        .select('responded_at, is_passed')
        .single()
      if (error) {
        // Otra escritura creó la fila entre la lectura y el insert (UNIQUE itr_id, item_id).
        if (error.code === '23505' && checkVersion) {
          const now = await reread()
          if (now) return conflictFrom(now)
        }
        return { error: error.message }
      }
      respondedAt = written?.responded_at ?? null
      isPassed = written?.is_passed ?? null
    }

    // S05 (C-34, D7): el estado y el avance los recalcula la BD desde el contenido (evaluate_itr_capture);
    // la RLS y guard_itr_derived ya no dejan escribirlos desde aquí.
    const { data: refreshed, error: progressError } = await ctx.supabase.rpc('refresh_itr_status', { p_itr_id: itrId })
    if (progressError) return { error: t('itrInstances.progressFailed') }
    const state = (refreshed ?? {}) as { status?: string; progress_pct?: number | string }

    return {
      ...(respondedAt ? { respondedAt } : {}),
      isPassed,
      ...(state.status ? { status: state.status } : {}),
      ...(state.progress_pct != null ? { progressPct: Number(state.progress_pct) } : {}),
    }
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
      /** A02: UUID de la captura (dispositivo); reenviarla devuelve el mismo adjunto. */
      captureId?: string
      /** A02: hora del dispositivo al tomarla; la BD la acota (trigger itr_attachment_times). */
      capturedAt?: string
    },
  ): Promise<{ id?: string; capturedAt?: string; progressStale?: boolean; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { itrId, itemId, storagePath, fileType, latitude, longitude, projectId, tagId, captureId, capturedAt } = input

    const { data: itr, error: itrError } = await ctx.supabase.from('itrs')
      .select('template_id, project_id, tag_id, status, source_rows').eq('id', itrId).single()
    if (itrError || !itr) return { error: t('itrInstances.itrNotFound') }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itr.project_id)
    if (!access.ok) return { error: await accessError(access) }
    if (itr.project_id !== projectId || itr.tag_id !== tagId) return { error: t('itrInstances.itrMismatch') }
    if (captureId !== undefined && !UUID_RE.test(captureId)) return { error: t('itrInstances.evidenceMissing') }

    // A02: si un intento anterior ya la guardó (y se perdió la respuesta), devolver ese adjunto aunque el ITR
    // haya avanzado después (firmado, aprobado): la evidencia ya está, reintentar no debe fallar ni duplicar.
    const findCapture = async () => captureId
      ? (await ctx.supabase.from('itr_attachments').select('id, itr_id, captured_at').eq('capture_id', captureId).maybeSingle()).data
      : null
    const saved = await findCapture()
    if (saved) {
      if (saved.itr_id !== itrId) return { error: t('itrInstances.itrMismatch') }
      return { id: saved.id, capturedAt: saved.captured_at }
    }
    if (itr.status === 'approved') return { error: t('itrInstances.itrApproved') }
    const captureError = await captureBlocker(ctx, itrId)
    if (captureError) return { error: captureError }
    const { data: signatures, error: signatureError } = await ctx.supabase.from('itr_signatures').select('id').eq('itr_id', itrId)
    if (signatureError || !signatures) return { error: t('itrInstances.signatureCheckFailed') }
    if (signatures.length > 0) return { error: t('itrInstances.itrSignedEvidence') }

    if (itemId) {
      const { data: item, error: itemError } = await ctx.supabase.from('itr_template_items')
        .select('id').eq('id', itemId).eq('template_id', itr.template_id).maybeSingle()
      if (itemError || !item) return { error: t('itrInstances.itemNotInTemplate') }
    }
    if (!storagePath.trim() || !fileType.trim()) return { error: t('itrInstances.evidenceMissing') }
    // Mirrors the bucket allowlist: photos as images, documentary evidence as PDF.
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(fileType)) return { error: t('itrInstances.evidenceType') }

    const { data, error } = await ctx.supabase
      .from('itr_attachments')
      .insert({
        itr_id: itrId,
        item_id: itemId ?? null,
        file_url: storagePath,
        file_type: fileType,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        capture_id: captureId ?? null,
        captured_at: capturedAt ?? new Date().toISOString(),
        uploaded_by: ctx.userId,
      })
      .select('id, captured_at')
      .single()

    if (error) {
      // A02: dos envíos simultáneos de la misma captura: gana uno y el otro devuelve ese adjunto.
      const raced = error.code === '23505' ? await findCapture() : null
      if (raced && raced.itr_id === itrId) return { id: raced.id, capturedAt: raced.captured_at }
      return { error: error.message }
    }

    // S05 (C-34): la BD recalcula estado y avance desde el contenido. A02: si el recálculo falla, la evidencia
    // ya quedó guardada: se informa como avance desactualizado, no como error (un reintento la duplicaría).
    const { error: progressError } = await ctx.supabase.rpc('refresh_itr_status', { p_itr_id: itrId })

    revalidatePath(`/projects/${projectId}/tags/${tagId}/itrs/${itrId}`)
    return progressError ? { id: data.id, capturedAt: data.captured_at, progressStale: true } : { id: data.id, capturedAt: data.captured_at }
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
    const t = await getTranslations('ActionErrors')
    const { attachmentId, projectId, tagId, itrId } = input

    const { data: itr, error: itrError } = await ctx.supabase.from('itrs')
      .select('template_id, project_id, tag_id, status, source_rows').eq('id', itrId).single()
    if (itrError || !itr) return { error: t('itrInstances.itrNotFound') }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itr.project_id)
    if (!access.ok) return { error: await accessError(access) }
    if (itr.project_id !== projectId || itr.tag_id !== tagId) return { error: t('itrInstances.itrMismatch') }
    if (itr.status === 'approved') return { error: t('itrInstances.itrApproved') }
    const captureError = await captureBlocker(ctx, itrId)
    if (captureError) return { error: captureError }
    const { data: signatures, error: signatureError } = await ctx.supabase.from('itr_signatures').select('id').eq('itr_id', itrId)
    if (signatureError || !signatures) return { error: t('itrInstances.signatureCheckFailed') }
    if (signatures.length > 0) return { error: t('itrInstances.itrSignedEvidence') }

    const { data: attachment, error: attachmentError } = await ctx.supabase.from('itr_attachments')
      .select('id, file_url').eq('id', attachmentId).eq('itr_id', itrId).single()
    if (attachmentError || !attachment) return { error: t('itrInstances.attachmentMismatch') }

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

    // S05 (C-34): la BD recalcula estado y avance desde el contenido.
    const { error: progressError } = await ctx.supabase.rpc('refresh_itr_status', { p_itr_id: itrId })
    if (progressError) return { error: t('itrInstances.evidenceProgressFailed') }

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
    const t = await getTranslations('ActionErrors')
    const { data: itrRow, error: itrError } = await ctx.supabase.from('itrs')
      .select('project_id, tag_id').eq('id', itrId).single()
    if (itrError || !itrRow) return { error: t('itrInstances.itrNotFound') }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: await accessError(access) }
    if (itrRow.project_id !== projectId || itrRow.tag_id !== tagId) return { error: t('itrInstances.itrMismatch') }
    if (!(['executor', 'supervisor', 'client'] as const).includes(role)) return { error: t('itrInstances.signRoleInvalid') }
    // C-26 (S05): el trazo es un PNG base64 de hasta ~256 KB (la RPC también lo valida).
    if (signatureImage && (!signatureImage.startsWith('data:image/png;base64,') || signatureImage.length > 350_000)) {
      return { error: t('itrInstances.signatureInvalid') }
    }

    // Database transaction owns content validation, assignment order, audit and approval.
    const { error } = await ctx.supabase.rpc('sign_itr_atomic', {
      p_itr_id: itrId, p_role: role, p_signature_image: signatureImage ?? undefined,
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
    const t = await getTranslations('ActionErrors')
    const reason = (input.reason ?? '').trim()
    if (reason.length < 3) {
      return { error: t('itrInstances.reasonMin3') }
    }

    const { itrId, projectId, tagId } = input

    const { data: itrRow, error: itrReadError } = await ctx.supabase.from('itrs')
      .select('project_id, tag_id').eq('id', itrId).single()
    if (itrReadError || !itrRow) return { error: t('itrInstances.itrNotFound') }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: await accessError(access) }
    if (itrRow.project_id !== projectId || itrRow.tag_id !== tagId) return { error: t('itrInstances.itrMismatch') }
    const { data, error } = await ctx.supabase.rpc('reopen_itr_atomic', { p_itr_id: itrId, p_reason: reason })
    if (error) return { error: error.message }
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || typeof data.revoked_count !== 'number' || !Array.isArray(data.previous_signatures)) {
      return { error: t('itrInstances.reopenUnverified') }
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

// ── Devolver al ejecutor (S05, C-23) ─────────────────────────────────────────
// El supervisor o el cliente asignado devuelve el ITR con observaciones: se retiran las firmas, el ejecutor
// corrige y vuelve a firmar. La RPC exige la asignación, el motivo (≥ 10), audita y avisa al ejecutor.
export const returnItrToExecutor = withAuthOnly(
  {},
  async (ctx, input: { itrId: string; projectId: string; tagId: string | null; reason: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const reason = (input.reason ?? '').trim()
    if (reason.length < 10) return { error: t('itrInstances.rejectReasonMin10') }
    const { data: itrRow } = await ctx.supabase.from('itrs').select('project_id').eq('id', input.itrId).maybeSingle()
    if (!itrRow || itrRow.project_id !== input.projectId) return { error: t('itrInstances.itrNotFound') }
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, itrRow.project_id)
    if (!access.ok) return { error: await accessError(access) }
    const { error } = await ctx.supabase.rpc('return_itr_to_executor', { p_itr_id: input.itrId, p_reason: reason })
    if (error) return { error: error.message }
    if (input.tagId) revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/itrs/${input.itrId}`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    revalidatePath('/my-work')
    return {}
  },
)

// ── Alcance de la continuidad (A38) ──────────────────────────────────────────
// Lo fija un líder o superior que no es el ejecutor, antes de la primera firma; cambiarlo exige motivo (≥ 10).
// La RPC lo valida todo, lo audita y recalcula el estado del ITR.
export const setContinuityScope = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { itrId: string; itemId: string; projectId: string; tagId: string; grouping: 'pairs' | 'conductors'; count: number; shields: string[]; reason?: string }): Promise<{ error?: string; changed?: boolean }> => {
    const t = await getTranslations('ActionErrors')
    if (!UUID_RE.test(input.itrId) || !UUID_RE.test(input.itemId)) return { error: t('itrInstances.invalidRequest') }
    const { data: itrRow } = await ctx.supabase.from('itrs').select('project_id').eq('id', input.itrId).maybeSingle()
    if (!itrRow || itrRow.project_id !== input.projectId) return { error: t('itrInstances.itrNotFound') }
    const { data, error } = await ctx.supabase.rpc('set_itr_continuity_scope', {
      p_itr_id: input.itrId, p_item_id: input.itemId, p_grouping: input.grouping, p_count: input.count,
      p_shields: input.shields, p_reason: input.reason?.trim() ?? sqlArg<string>(null),
    })
    if (error) {
      const code = ['executor_cannot_scope', 'invalid_item', 'itr_signed', 'invalid_scope', 'reason_required'].find(c => error.message.includes(c))
      return { error: code ? t(`itrInstances.continuityScope.${code}`) : error.message }
    }
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/itrs/${input.itrId}`)
    return { changed: fromJson<{ changed: boolean }>(data).changed }
  },
)
