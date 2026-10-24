'use server'

import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { accessError } from '@/lib/i18n/action-errors'
import type { Enums } from '@/types/supabase.generated'
import { isCriticality, type Criticality } from '@/lib/tags/criticality'
import { TAG_MOVE_REASON_MIN, type TagMovePreview } from '@/lib/tags/move'
import { fromJson } from '@/lib/supabase/casts'

export interface TagUpdatePayload {
  description?: string
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  status?: Enums<'tag_status'>
  preservation_required?: boolean
  pid_drawing?: string | null
  // Engineering params
  range_min?: number | null
  range_max?: number | null
  eng_unit?: string | null
  sp_h?: number | null
  sp_hh?: number | null
  sp_l?: number | null
  sp_ll?: number | null
  signal_type?: string | null
  sil_level?: string | null
  criticality?: Criticality
  io_address?: string | null
  junction_box?: string | null
  datasheet_number?: string | null
  revision?: string | null
  fluid_type?: string | null
  mounting_typical?: string | null
}

export const deleteTag = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, projectId: string, tagId: string): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }

    const { error } = await ctx.supabase
      .from('tags')
      .delete()
      .eq('id', tagId)
      .eq('project_id', projectId)

    // C-42 (S08): el historial de preservación protege al tag (ON DELETE RESTRICT).
    if (error?.code === '23503' && error.message.includes('preservation_')) {
      return { error: t('tags.hasPreservationHistory') }
    }
    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}/tags`)
    return {}
  },
)

export const updateTag = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    tagId: string,
    payload: TagUpdatePayload,
  ): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }
    if ('criticality' in payload && !isCriticality(payload.criticality)) {
      return { error: t('tags.invalidCriticality') }
    }

    const { error } = await ctx.supabase
      .from('tags')
      .update(payload)
      .eq('id', tagId)
      .eq('project_id', projectId)

    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}/tags/${tagId}`)
    revalidatePath(`/projects/${projectId}/tags`)
    return {}
  },
)

// ── NFC binding ─────────────────────────────────────────────────────────

export const linkNfcToTag = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId' },
    ],
  },
  async (
    ctx,
    input: { projectId: string; tagId: string; nfcUid: string },
  ): Promise<{ error?: string; conflictTagNumber?: string }> => {
    const t = await getTranslations('ActionErrors')
    const trimmed = input.nfcUid.trim()
    if (!trimmed) return { error: t('tags.nfcEmpty') }

    // Pre-check uniqueness within the project to give a friendlier error than the
    // raw 23505 constraint violation (and surface which tag already has it).
    const { data: existing } = await ctx.supabase
      .from('tags')
      .select('id, tag_number')
      .eq('project_id', input.projectId)
      .eq('nfc_uid', trimmed)
      .maybeSingle()
    if (existing && existing.id !== input.tagId) {
      return { error: t('tags.nfcConflict', { tag: existing.tag_number }), conflictTagNumber: existing.tag_number }
    }

    const { error } = await ctx.supabase
      .from('tags')
      .update({ nfc_uid: trimmed })
      .eq('id', input.tagId)
      .eq('project_id', input.projectId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    return {}
  },
)

export const unlinkNfc = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId' },
    ],
  },
  async (
    ctx,
    input: { projectId: string; tagId: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('tags')
      .update({ nfc_uid: null })
      .eq('id', input.tagId)
      .eq('project_id', input.projectId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    return {}
  },
)
// ── Mover de subsistema (C-16, D9) ──────────────────────────────────────────
// Líder+ con motivo (≥ 10). La RPC mueve en una transacción el tag, sus ITR sin firmar y sus punches
// abiertos, y lo deja en activity_log; un ITR firmado bloquea. Por REST el trigger lo impide.

export const previewTagMove = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId' },
      { resource: 'subsystem', field: 'subsystemId', scopeField: 'projectId' },
    ],
  },
  async (ctx, input: { projectId: string; tagId: string; subsystemId: string }): Promise<{ error?: string; preview?: TagMovePreview }> => {
    const { data, error } = await ctx.supabase.rpc('tag_subsystem_move_preview', { p_tag_id: input.tagId, p_subsystem_id: input.subsystemId })
    if (error) return { error: error.message }
    return { preview: fromJson<TagMovePreview>(data) }
  },
)

export const moveTagSubsystem = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'tag', field: 'tagId', scopeField: 'projectId' },
      { resource: 'subsystem', field: 'subsystemId', scopeField: 'projectId' },
    ],
  },
  async (
    ctx,
    input: { projectId: string; tagId: string; subsystemId: string; reason: string },
  ): Promise<{ error?: string; itrsMoved?: number; punchesMoved?: number }> => {
    const t = await getTranslations('ActionErrors')
    const reason = (input.reason ?? '').trim()
    if (reason.length < TAG_MOVE_REASON_MIN) return { error: t('tags.moveReason', { min: TAG_MOVE_REASON_MIN }) }
    const { data, error } = await ctx.supabase.rpc('move_tag_subsystem', {
      p_tag_id: input.tagId, p_subsystem_id: input.subsystemId, p_reason: reason,
    })
    if (error) return { error: error.message }
    const res = fromJson<{ itrs_moved: number; punches_moved: number }>(data)
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    revalidatePath(`/projects/${input.projectId}/tags`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    revalidatePath(`/projects/${input.projectId}/punches`)
    revalidatePath('/projects/[id]/readiness', 'page')
    return { itrsMoved: res.itrs_moved, punchesMoved: res.punches_moved }
  },
)
