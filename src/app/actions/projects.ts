'use server'

import { OWNER_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/types/database'

export interface ProjectUpdatePayload {
  name?: string
  code?: string
  country?: string | null
  region?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: ProjectStatus
}

export const updateProject = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    payload: ProjectUpdatePayload,
  ): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const { error } = await ctx.supabase
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}`)
    return {}
  },
)

export const deleteProject = withAuthOnly(
  { role: OWNER_ROLES },
  async (ctx, projectId: string): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const { error } = await ctx.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }

    revalidatePath('/projects')
    return {}
  },
)
