import type { SupabaseClient } from '@supabase/supabase-js'

export type ItrAssignmentChange = {
  itrId: string
  itrNumber: string
  projectId: string
  tagId?: string | null
  role: 'executor' | 'supervisor' | 'client'
  recipientUserId: string
  changeType: 'added' | 'removed'
}

const ROLE_LABEL_ES: Record<string, string> = {
  executor: 'ejecutor',
  supervisor: 'supervisor',
  client: 'cliente',
}

export async function notifyItrAssignmentChanged(
  admin: SupabaseClient,
  orgId: string,
  actorUserId: string,
  changes: ItrAssignmentChange[],
): Promise<void> {
  const filtered = changes.filter(c => c.recipientUserId && c.recipientUserId !== actorUserId)
  if (filtered.length === 0) return

  const rows = filtered.map(c => {
    const roleLabel = ROLE_LABEL_ES[c.role] ?? c.role
    const link = c.tagId
      ? `/projects/${c.projectId}/tags/${c.tagId}/itrs/${c.itrId}`
      : `/projects/${c.projectId}/itrs`
    const title = c.changeType === 'added'
      ? `Asignado al ITR ${c.itrNumber} como ${roleLabel}`
      : `Removido del ITR ${c.itrNumber} (${roleLabel})`
    return {
      org_id: orgId,
      recipient_user_id: c.recipientUserId,
      kind: 'itr_assignment_changed',
      title,
      body: null,
      link_url: link,
      payload: {
        itrId: c.itrId,
        itrNumber: c.itrNumber,
        projectId: c.projectId,
        tagId: c.tagId ?? null,
        role: c.role,
        action: c.changeType,
      },
    }
  })

  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('[notifications.insert itr_assignment_changed]', error)
}
