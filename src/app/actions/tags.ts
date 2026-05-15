'use server'

import { getActiveMembership } from '@/lib/supabase/membership'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
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

export async function deleteTag(
  projectId: string,
  tagId: string
): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos para eliminar' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await ctx.supabase
    .from('tags')
    .delete()
    .eq('id', tagId)
    .eq('project_id', projectId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags`)
  return {}
}

export async function updateTag(
  projectId: string,
  tagId: string,
  payload: TagUpdatePayload
): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos para editar' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await ctx.supabase
    .from('tags')
    .update(payload)
    .eq('id', tagId)
    .eq('project_id', projectId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/tags`)
  return {}
}

// ── NFC binding ─────────────────────────────────────────────────────────

export async function linkNfcToTag(input: {
  projectId: string
  tagId: string
  nfcUid: string
}): Promise<{ error?: string; conflictTagNumber?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const trimmed = input.nfcUid.trim()
  if (!trimmed) return { error: 'NFC UID vacío' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('org_id', ctx.orgId)
    .single()
  if (!project) return { error: 'Proyecto no encontrado' }

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
}

export async function unlinkNfc(input: {
  projectId: string
  tagId: string
}): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('tags')
    .update({ nfc_uid: null })
    .eq('id', input.tagId)
    .eq('project_id', input.projectId)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  return {}
}
