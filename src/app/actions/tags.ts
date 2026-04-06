'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PRIVILEGED_ROLES = ['owner', 'admin', 'architect']

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'No perteneces a ninguna organización' }
  if (!PRIVILEGED_ROLES.includes(membership.role)) return { error: 'Sin permisos para eliminar' }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await supabase
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'No perteneces a ninguna organización' }
  if (!PRIVILEGED_ROLES.includes(membership.role)) return { error: 'Sin permisos para editar' }

  // Verify project belongs to org
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await supabase
    .from('tags')
    .update(payload)
    .eq('id', tagId)
    .eq('project_id', projectId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags/${tagId}`)
  revalidatePath(`/projects/${projectId}/tags`)
  return {}
}
