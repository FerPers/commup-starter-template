'use server'

import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'

export interface TagUpdatePayload {
  description?: string
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  status?: string
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
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const { error } = await ctx.supabase
      .from('tags')
      .delete()
      .eq('id', tagId)
      .eq('project_id', projectId)

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
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

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
    const trimmed = input.nfcUid.trim()
    if (!trimmed) return { error: 'NFC UID vacío' }

    // Pre-check uniqueness within the project to give a friendlier error than the
    // raw 23505 constraint violation (and surface which tag already has it).
    const { data: existing } = await ctx.supabase
      .from('tags')
      .select('id, tag_number')
      .eq('project_id', input.projectId)
      .eq('nfc_uid', trimmed)
      .maybeSingle()
    if (existing && existing.id !== input.tagId) {
      return { error: 'NFC ya vinculado a otro tag', conflictTagNumber: existing.tag_number }
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