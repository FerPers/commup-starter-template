'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/types/database'

const PRIVILEGED_ROLES = ['owner', 'admin', 'architect']

export interface ProjectUpdatePayload {
  name?: string
  code?: string
  start_date?: string | null
  end_date?: string | null
  status?: ProjectStatus
}

export async function updateProject(
  projectId: string,
  payload: ProjectUpdatePayload
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

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .eq('org_id', membership.org_id)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}
