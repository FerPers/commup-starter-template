'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { PUNCH_RAISE_ROLES } from '@/lib/constants/punch-roles'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'
import type { TablesUpdate } from '@/types/supabase.generated'
import { PUNCH_IMPACTS, STARTUP_DISPOSITIONS, type PunchImpact, type StartupDisposition } from '@/lib/punches/category-guide'

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

    const { data: punch, error } = await supabase
      .from('punches')
      .insert({
        project_id: input.projectId,
        subsystem_id: subsystemId,
        // El trigger punch_number_before_insert asigna el número atómico cuando llega ''
        punch_number: '',
        tag_id: input.tagId ?? null,
        itr_id: input.itrId ?? null,
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

    const update: TablesUpdate<'punches'> = { status: input.status }
    if (input.status === 'cancelled') {
      update.closed_date = new Date().toISOString().split('T')[0]
    }

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

    const { error } = await supabase
      .from('punches')
      .delete()
      .eq('id', input.punchId)

    if (error) return { error: error.message }

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

    const attachments = await Promise.all(
      (rows ?? []).map(async row => {
        const { data: signed } = await supabase.storage
          .from('punch-attachments')
          .createSignedUrl(row.file_url, 3600)
        return {
          id: row.id,
          file_url: row.file_url,
          signed_url: signed?.signedUrl ?? null,
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
    const { error: storageError } = await ctx.supabase.storage
      .from('punch-attachments')
      .remove([input.storagePath])
    if (storageError) return { error: storageError.message }

    const { error } = await ctx.supabase
      .from('punch_attachments')
      .delete()
      .eq('id', input.attachmentId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/punches`)
    if (input.tagId) {
      revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    }

    return {}
  },
)