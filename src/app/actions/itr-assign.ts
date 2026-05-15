'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import { revalidatePath } from 'next/cache'

export async function bulkAssignItrs(
  ids: string[],
  userId: string,
  role: 'executor' | 'supervisor' | 'client',
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  // Snapshot current assignments for this role to compute diff after the swap.
  const [{ data: prevAssigns }, { data: itrRows }] = await Promise.all([
    ctx.supabase
      .from('itr_assignments')
      .select('itr_id, user_id')
      .in('itr_id', ids)
      .eq('role', role),
    ctx.supabase
      .from('itrs')
      .select('id, itr_number, project_id, tag_id')
      .in('id', ids),
  ])

  const { error: delErr } = await ctx.supabase
    .from('itr_assignments')
    .delete()
    .in('itr_id', ids)
    .eq('role', role)

  if (delErr) return { error: delErr.message }

  const rows = ids.map(itr_id => ({ itr_id, user_id: userId, role }))
  const { error: insErr } = await ctx.supabase
    .from('itr_assignments')
    .insert(rows)

  if (insErr) return { error: insErr.message }

  const prevByItr = new Map<string, string>()
  for (const r of prevAssigns ?? []) {
    if (r.itr_id && r.user_id) prevByItr.set(r.itr_id, r.user_id)
  }
  const itrMeta = new Map(
    (itrRows ?? []).map(r => [r.id, { itr_number: r.itr_number as string, project_id: r.project_id as string, tag_id: (r.tag_id as string | null) }]),
  )

  const changes: ItrAssignmentChange[] = []
  for (const itrId of ids) {
    const meta = itrMeta.get(itrId)
    if (!meta) continue
    const prevUser = prevByItr.get(itrId) ?? null
    if (prevUser === userId) continue
    if (prevUser) {
      changes.push({
        itrId,
        itrNumber: meta.itr_number,
        projectId: meta.project_id,
        tagId: meta.tag_id,
        role,
        recipientUserId: prevUser,
        changeType: 'removed',
      })
    }
    changes.push({
      itrId,
      itrNumber: meta.itr_number,
      projectId: meta.project_id,
      tagId: meta.tag_id,
      role,
      recipientUserId: userId,
      changeType: 'added',
    })
  }

  if (changes.length > 0) {
    const admin = createAdminClient()
    await notifyItrAssignmentChanged(admin, ctx.orgId, ctx.userId, changes)
  }

  revalidatePath('/itrs')
  return {}
}
