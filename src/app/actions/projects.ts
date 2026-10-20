'use server'

import { OWNER_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/types/database'
import { isValidTimeZone } from '@/lib/time/zone'

export interface ProjectUpdatePayload {
  name?: string
  code?: string
  country?: string | null
  region?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: ProjectStatus
  /** S10 (D12): zona IANA del proyecto (la BD la valida con pg_timezone_names). */
  timezone?: string
}

const UPDATABLE = ['name', 'code', 'country', 'region', 'start_date', 'end_date', 'status', 'timezone'] as const

export const updateProject = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    payload: ProjectUpdatePayload,
  ): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    if ('timezone' in payload && !isValidTimeZone(payload.timezone)) return { error: 'Zona horaria no válida' }
    // Solo los campos editables (el payload llega del cliente).
    const patch = Object.fromEntries(UPDATABLE.filter(k => k in payload).map(k => [k, payload[k]])) as ProjectUpdatePayload

    const { error } = await ctx.supabase
      .from('projects')
      .update(patch)
      .eq('id', projectId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }

    // La zona cambia «hoy» en todo el proyecto (S10): revalidar el árbol completo.
    revalidatePath(`/projects/${projectId}`, 'layout')
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
