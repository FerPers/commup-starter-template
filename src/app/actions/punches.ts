'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { PUNCH_RAISE_ROLES } from '@/lib/constants/punch-roles'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'
import { punchDeleteBlocker } from '@/lib/punches/deletable'
import type { TablesUpdate } from '@/types/supabase.generated'
import { PUNCH_IMPACTS, STARTUP_DISPOSITIONS, type PunchImpact, type StartupDisposition } from '@/lib/punches/category-guide'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── createPunch ────────────────────────────────────────────────────────────

export const createPunch = withAuth(
  {
    role: PUNCH_RAISE_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId', optional: true },
    ],
  },
  async (
    ctx,
    input: {
      projectId: string
      tagId?: string | null
      itrId?: string | null
      category: 'A' | 'B' | 'C'
      description: string
      assignedTo?: string | null
      targetDate?: string | null
      priority?: 'critical' | 'major' | 'minor'
      /** Impacto funcional (obligatorio desde la fase 4, §10.5). */
      impact?: PunchImpact | null
      /** Solo la cola offline: punch encolados antes de que el impacto fuera obligatorio. */
      legacyWithoutImpact?: boolean
      /** S06 (C-22): id generado en el cliente para que la bandeja sin red sea idempotente (fotos en `<id>/…`). */
      id?: string
      /** S06 (C-22): ítem del ITR desde el que se levantó. */
      itrItemId?: string | null
    },
  ): Promise<{ punchId?: string; punchNumber?: string; error?: string }> => {
    const { supabase, orgId, userId } = ctx

    if (input.impact && !PUNCH_IMPACTS.includes(input.impact)) return { error: 'Impacto no válido' }
    if (!input.impact && !input.legacyWithoutImpact) return { error: 'Indica el impacto del punch (seguridad, ambiente, proceso, equipo u operabilidad)' }

    let subsystemId: string | null = null
    let disciplineId: string | null = null

    if (input.tagId) {
      const { data: tag } = await supabase
        .from('tags')
        .select('subsystem_id, discipline_id')
        .eq('id', input.tagId)
        .single()
      if (!tag) return { error: 'Tag no encontrado' }
      subsystemId = tag.subsystem_id
      disciplineId = tag.discipline_id
    }

    if (!subsystemId || !disciplineId) {
      return { error: 'No se puede resolver subsistema o disciplina del tag' }
    }
    if (input.id && !UUID_RE.test(input.id)) return { error: 'Identificador de punch inválido' }

    // Reintento de la bandeja: si ya se creó con este id, no se duplica.
    if (input.id) {
      const { data: existing } = await supabase.from('punches').select('id, punch_number').eq('id', input.id).maybeSingle()
      if (existing) return { punchId: existing.id, punchNumber: existing.punch_number }
    }

    const { data: punch, error } = await supabase
      .from('punches')
      .insert({
        ...(input.id ? { id: input.id } : {}),
        project_id: input.projectId,
        subsystem_id: subsystemId,
        // El trigger punch_number_before_insert asigna el número atómico cuando llega ''
        punch_number: '',
        tag_id: input.tagId ?? null,
        itr_id: input.itrId ?? null,
        itr_item_id: input.itrItemId ?? null,
        category: input.category,
        description: input.description,
        discipline_id: disciplineId,
        raised_by: userId,
        assigned_to: input.assignedTo ?? null,
        status: 'open',
        priority: input.priority ?? 'major',
        target_date: input.targetDate ?? null,
        impact: input.impact ?? null,
      })
      .select('id, punch_number')
      .single()

    if (error) return { error: error.message }

    if (input.assignedTo && input.assignedTo !== userId) {
      const admin = createAdminClient()
      const { error: notifErr } = await admin.from('notifications').insert({
        org_id: orgId,
        recipient_user_id: input.assignedTo,
        kind: 'punch_assigned',
        title: `Te asignaron el punch ${punch.punch_number}`,
        body: input.description.length > 140 ? `${input.description.slice(0, 137)}…` : input.description,
        link_url: input.tagId
          ? `/projects/${input.projectId}/tags/${input.tagId}`
          : `/projects/${input.projectId}/punches`,
        payload: {
          punchId: punch.id,
          punchNumber: punch.punch_number,
          projectId: input.projectId,
          tagId: input.tagId ?? null,
          category: input.category,
          priority: input.priority ?? 'major',
        },
      })
      if (notifErr) console.error('[notifications.insert]', notifErr)
    }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return { punchId: punch.id, punchNumber: punch.punch_number }
  },
)

// ── reassignPunch ──────────────────────────────────────────────────────────

export const reassignPunch = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      punchId: string
      projectId: string
      tagId?: string | null
      newAssignee: string | null
    },
  ): Promise<{ error?: string }> => {
    const { supabase, userId, orgId } = ctx

    const { data: punch } = await supabase
      .from('punches')
      .select('id, punch_number, description, category, priority, project_id, tag_id, assigned_to')
      .eq('id', input.punchId)
      .single()
    if (!punch) return { error: 'Punch no encontrado' }
    if (punch.project_id !== input.projectId) return { error: 'Punch no pertenece al proyecto' }
    if (punch.assigned_to === input.newAssignee) return {}

    const { error } = await supabase
      .from('punches')
      .update({ assigned_to: input.newAssignee })
      .eq('id', input.punchId)
    if (error) return { error: error.message }

    await logActivity(supabase, {
      orgId,
      userId,
      entityType: 'punch',
      entityId: input.punchId,
      action: 'reassigned',
      payload: { from: punch.assigned_to, to: input.newAssignee, projectId: input.projectId },
    })

    if (input.newAssignee && input.newAssignee !== userId) {
      const admin = createAdminClient()
      const body = (punch.description ?? '').length > 140
        ? `${(punch.description ?? '').slice(0, 137)}…`
        : (punch.description ?? '')
      const { error: notifErr } = await admin.from('notifications').insert({
        org_id: orgId,
        recipient_user_id: input.newAssignee,
        kind: 'punch_assigned',
        title: `Te asignaron el punch ${punch.punch_number}`,
        body,
        link_url: punch.tag_id
          ? `/projects/${input.projectId}/tags/${punch.tag_id}`
          : `/projects/${input.projectId}/punches`,
        payload: {
          punchId: punch.id,
          punchNumber: punch.punch_number,
          projectId: input.projectId,
          tagId: punch.tag_id,
          category: punch.category,
          priority: punch.priority,
        },
      })
      if (notifErr) console.error('[notifications.insert]', notifErr)
    }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }
    return {}
  },
)

// ── updatePunchStatus ──────────────────────────────────────────────────────

export const updatePunchStatus = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      punchId: string
      status: 'open' | 'in_progress' | 'closed' | 'cancelled'
      projectId: string
      tagId?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { supabase } = ctx
    // Cerrar solo por verificación en campo (verifyPunch); el trigger lo rechazaría igual.
    if (input.status === 'closed') return { error: 'Para cerrar un punch hay que verificarlo en campo' }
    // S06 (C-11, D8): cancelar va por cancelPunch (motivo, supervisor distinto de quien lo levantó).
    if (input.status === 'cancelled') return { error: 'Para cancelar un punch indica el motivo con «Cancelar»' }

    const update: TablesUpdate<'punches'> = { status: input.status }

    const { error } = await supabase
      .from('punches')
      .update(update)
      .eq('id', input.punchId)

    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return {}
  },
)

// ── cancelPunch (S06, C-11/A-06, D8) ───────────────────────────────────────
// Un supervisor (leader+) distinto de quien lo levantó, con motivo (≥ 10). La RPC lo deja en los
// comentarios y en activity_log; el trigger impide cancelar por cualquier otra vía.

export const cancelPunch = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { punchId: string; projectId: string; tagId?: string | null; reason: string }): Promise<{ error?: string }> => {
    const reason = (input.reason ?? '').trim()
    if (reason.length < 10) return { error: 'Explica por qué se cancela (mínimo 10 caracteres)' }
    const { error } = await ctx.supabase.rpc('cancel_punch', { p_punch_id: input.punchId, p_reason: reason })
    if (error) return { error: error.message }
    revalidatePunch(input.projectId, input.tagId)
    return {}
  },
)

// ── Resolver / verificar / revisar categoría (fase 4 · bloque A) ───────────
// Las tres pasan por RPC SECURITY DEFINER (migración 20261016120000): «resuelto» es un sub-estado de
// in_progress; cerrar = verificar en campo por OTRA persona; la revisión de categoría la hace un
// supervisor distinto de quien levantó el punch. Un trigger impide cerrar por fuera de verify_punch.

function revalidatePunch(projectId: string, tagId?: string | null) {
  revalidatePath(`/projects/${projectId}/punches`)
  revalidatePath('/punch-list')
  revalidatePath('/my-work')
  if (tagId) revalidatePath(`/projects/${projectId}/tags/${tagId}`)
}

/** Quien arregló el pendiente lo marca resuelto, describiendo qué se hizo. */
export const resolvePunch = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { punchId: string; projectId: string; tagId?: string | null; comment: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('resolve_punch', { p_punch_id: input.punchId, p_comment: input.comment ?? '' })
    if (error) return { error: error.message }
    revalidatePunch(input.projectId, input.tagId)
    return {}
  },
)

/** Verificación en campo: aceptar cierra el punch; rechazar lo devuelve a «en curso» (motivo obligatorio). */
export const verifyPunch = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { punchId: string; projectId: string; tagId?: string | null; accept: boolean; comment?: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('verify_punch', {
      p_punch_id: input.punchId,
      p_accept: input.accept,
      p_comment: input.comment, // la RPC recorta y trata '' como sin comentario
    })
    if (error) return { error: error.message }
    revalidatePunch(input.projectId, input.tagId)
    return {}
  },
)

/** Supervisor confirma o cambia la categoría (cambio con motivo obligatorio). */
export const reviewPunchCategory = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { punchId: string; projectId: string; tagId?: string | null; category: 'A' | 'B' | 'C'; note?: string },
  ): Promise<{ error?: string }> => {
    if (!['A', 'B', 'C'].includes(input.category)) return { error: 'Categoría no válida' }
    const { error } = await ctx.supabase.rpc('review_punch_category', {
      p_punch_id: input.punchId,
      p_category: input.category,
      p_note: input.note, // la RPC recorta y trata '' como sin nota
    })
    if (error) return { error: error.message }
    revalidatePunch(input.projectId, input.tagId)
    return {}
  },
)

/** Impacto y disposición para el arranque (PSSR 16.37). Columnas libres: solo se valida el valor. */
export const updatePunchClassification = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { punchId: string; projectId: string; tagId?: string | null; impact?: PunchImpact | null; startupDisposition?: StartupDisposition | null },
  ): Promise<{ error?: string }> => {
    if (ctx.role === 'client') return { error: 'Sin permiso' }
    const patch: TablesUpdate<'punches'> = {}
    if ('impact' in input) {
      if (input.impact && !PUNCH_IMPACTS.includes(input.impact)) return { error: 'Impacto no válido' }
      patch.impact = input.impact ?? null
    }
    if ('startupDisposition' in input) {
      if (input.startupDisposition && !STARTUP_DISPOSITIONS.includes(input.startupDisposition)) return { error: 'Disposición no válida' }
      patch.startup_disposition = input.startupDisposition ?? null
    }
    if (!Object.keys(patch).length) return {}
    const { error } = await ctx.supabase.from('punches').update(patch).eq('id', input.punchId).eq('project_id', input.projectId)
    if (error) return { error: error.message }
    revalidatePunch(input.projectId, input.tagId)
    revalidatePath(`/projects/${input.projectId}/pssr`, 'layout')
    return {}
  },
)

// ── addPunchComment ────────────────────────────────────────────────────────

export const addPunchComment = withAuth(
  {
    role: PUNCH_RAISE_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      punchId: string
      comment: string
      projectId: string
      tagId?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { supabase, userId } = ctx

    const { error } = await supabase.from('punch_comments').insert({
      punch_id: input.punchId,
      user_id: userId,
      comment: input.comment,
    })

    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return {}
  },
)

// ── deletePunch ────────────────────────────────────────────────────────────

export const deletePunch = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      punchId: string
      projectId: string
      tagId?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { supabase } = ctx

    // C-27 (S08): borrar es para errores de carga; con estado o evidencia se cancela con motivo. Auditado.
    const { data: punch } = await supabase
      .from('punches')
      .select('id, punch_number, category, status, resolved_at, post_handover_status, preservation_record_id, project_id, punch_attachments(count)')
      .eq('id', input.punchId)
      .eq('project_id', input.projectId)
      .maybeSingle()
    if (!punch) return { error: 'Punch no encontrado' }
    const blocker = punchDeleteBlocker({ ...punch, attachments: (punch.punch_attachments as unknown as { count: number }[])[0]?.count ?? 0 })
    if (blocker) return { error: `No se puede borrar: ${blocker}. Cancélalo con motivo.` }

    const { data: deleted, error } = await supabase
      .from('punches')
      .delete()
      .eq('id', input.punchId)
      .select('id')

    if (error) return { error: error.message }
    if (!deleted?.length) return { error: 'No se pudo borrar el punch (sin permiso)' }
    await logActivity(supabase, {
      orgId: ctx.orgId, userId: ctx.userId, entityType: 'punch', entityId: input.punchId, action: 'deleted',
      payload: { punchNumber: punch.punch_number, category: punch.category, projectId: input.projectId },
    })

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return {}
  },
)

// ── Punch Attachments ──────────────────────────────────────────────────────

export type PunchAttachmentRow = {
  id: string
  file_url: string
  signed_url: string | null
  uploaded_by: string
  uploaded_by_name: string | null
  created_at: string
  is_own: boolean
}

export const listPunchAttachments = withAuth(
  {},
  async (
    ctx,
    input: { punchId: string },
  ): Promise<{ attachments?: PunchAttachmentRow[]; error?: string }> => {
    const { supabase, userId } = ctx

    const { data: rows, error } = await supabase
      .from('punch_attachments')
      .select('id, file_url, uploaded_by, created_at, profiles:uploaded_by(full_name)')
      .eq('punch_id', input.punchId)
      .order('created_at', { ascending: true })

    if (error) return { error: error.message }

    // C-41 (S06): una sola llamada para todas las URL firmadas.
    const paths = (rows ?? []).map(r => r.file_url)
    const { data: signedList } = paths.length
      ? await supabase.storage.from('punch-attachments').createSignedUrls(paths, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] }
    const signedByPath = new Map((signedList ?? []).map(s => [s.path, s.signedUrl]))
    const attachments = await Promise.all(
      (rows ?? []).map(async row => {
        return {
          id: row.id,
          file_url: row.file_url,
          signed_url: signedByPath.get(row.file_url) ?? null,
          uploaded_by: row.uploaded_by,
          uploaded_by_name: row.profiles?.full_name ?? null,
          created_at: row.created_at,
          is_own: row.uploaded_by === userId,
        }
      }),
    )

    return { attachments }
  },
)

export const addPunchAttachment = withAuth(
  {
    role: PUNCH_RAISE_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      punchId: string
      storagePath: string
      projectId: string
      tagId?: string | null
    },
  ): Promise<{ id?: string; error?: string }> => {
    // S06: la bandeja sin red reintenta con la misma ruta: no duplicar el adjunto.
    const { data: existing } = await ctx.supabase.from('punch_attachments').select('id').eq('punch_id', input.punchId).eq('file_url', input.storagePath).maybeSingle()
    if (existing) return { id: existing.id }
    const { data, error } = await ctx.supabase
      .from('punch_attachments')
      .insert({
        punch_id: input.punchId,
        file_url: input.storagePath,
        uploaded_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return { id: data.id }
  },
)

export const deletePunchAttachment = withAuth(
  {
    role: PUNCH_RAISE_ROLES, // la RLS limita a la propia foto salvo editores (migración 20261025120000)
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      attachmentId: string
      storagePath: string
      projectId: string
      tagId?: string | null
    },
  ): Promise<{ error?: string }> => {
    // C-27 (S08): primero la fila (la RLS decide: la foto propia, o un supervisor) y solo si se borró, el
    // archivo. Antes se borraba el archivo primero y, si la RLS rechazaba la fila, quedaba un adjunto roto.
    const { data: deleted, error } = await ctx.supabase
      .from('punch_attachments')
      .delete()
      .eq('id', input.attachmentId)
      .eq('file_url', input.storagePath)
      .select('id')
    if (error) return { error: error.message }
    if (!deleted?.length) return { error: 'No se pudo borrar la foto: solo la borra quien la subió o un supervisor' }

    const { error: storageError } = await ctx.supabase.storage
      .from('punch-attachments')
      .remove([input.storagePath])
    if (storageError) console.error('[punch-attachments.remove]', storageError.message)

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return {}
  },
)