'use server'

import { getActiveMembership } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/types/database'

const PRIVILEGED_ROLES = ['owner', 'admin', 'architect']
const OWNER_ONLY = ['owner']

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
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

export async function deleteProject(projectId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }
  if (!OWNER_ONLY.includes(ctx.role)) return { error: 'Solo el owner puede eliminar proyectos' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { error } = await ctx.supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath('/projects')
  return {}
}
