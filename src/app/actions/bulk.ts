'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { revalidatePath } from 'next/cache'

export const bulkUpdateItrStatus = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], status: string): Promise<{ error?: string }> => {
    if (!ids.length) return {}

    const { error } = await ctx.supabase
      .from('itrs')
      .update({ status })
      .in('id', ids)

    if (error) return { error: error.message }
    revalidatePath('/itrs')
    return {}
  },
)

export const bulkUpdatePunchStatus = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], status: string): Promise<{ error?: string }> => {
    if (!ids.length) return {}

    const { error } = await ctx.supabase
      .from('punches')
      .update({ status })
      .in('id', ids)

    if (error) return { error: error.message }
    revalidatePath('/punch-list')
    return {}
  },
)

export const bulkUpdateTagStatus = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], status: string): Promise<{ error?: string }> => {
    if (!ids.length) return {}

    const { error } = await ctx.supabase
      .from('tags')
      .update({ status })
      .in('id', ids)

    if (error) return { error: error.message }
    revalidatePath('/tags')
    return {}
  },
)

export const bulkApproveItrs = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    ids: string[],
    projectId: string,
  ): Promise<{ approved?: number; error?: string }> => {
    if (!ids.length) return { approved: 0 }

    // Only approve ITRs that are 'completed' and belong to this project
    const { data, error } = await ctx.supabase
      .from('itrs')
      .update({ status: 'approved' })
      .in('id', ids)
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .select('id')

    if (error) return { approved: 0, error: error.message }

    const approved = data?.length ?? 0
    if (approved > 0) revalidatePath(`/projects/${projectId}/itrs`)
    return { approved }
  },
)

export const bulkDeletePunches = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[]): Promise<{ deleted?: number; error?: string }> => {
    if (!ids.length) return { deleted: 0 }

    const { data: rows, error: fetchErr } = await ctx.supabase
      .from('punches')
      .select('id, punch_number, project_id')
      .in('id', ids)

    if (fetchErr) return { deleted: 0, error: fetchErr.message }
    if (!rows || rows.length === 0) return { deleted: 0 }

    const deletableIds = rows.map(r => r.id)
    const { error } = await ctx.supabase
      .from('punches')
      .delete()
      .in('id', deletableIds)

    if (error) return { deleted: 0, error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      entityType: 'punch',
      action: 'bulk_deleted',
      payload: {
        count: deletableIds.length,
        punches: rows.map(r => ({ id: r.id, punch_number: r.punch_number, project_id: r.project_id })),
      },
    })

    const projectIds = new Set(rows.map(r => r.project_id).filter(Boolean) as string[])
    projectIds.forEach(pid => revalidatePath(`/projects/${pid}/punches`))
    revalidatePath('/punch-list')

    return { deleted: deletableIds.length }
  },
)
