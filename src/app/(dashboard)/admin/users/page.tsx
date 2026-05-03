import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import UsersView from './UsersView'

type ActivityRow = {
  entity_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export default async function AdminUsersPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  if (!['owner', 'admin'].includes(ctx.role)) redirect('/dashboard')

  const orgId = ctx.orgId

  const [{ data: members }, { data: emails }, { data: invitedActivity }] = await Promise.all([
    supabase
      .from('org_members')
      .select('id, user_id, role, joined_at, profiles(full_name, avatar_url)')
      .eq('org_id', orgId)
      .order('joined_at'),
    supabase.rpc('get_org_member_emails', { p_org_id: orgId }),
    supabase
      .from('activity_log')
      .select('entity_id, payload, created_at')
      .eq('org_id', orgId)
      .eq('entity_type', 'user')
      .eq('action', 'invited')
      .order('created_at', { ascending: false }),
  ])

  // Merge email into member list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailMap = new Map<string, string>((emails ?? []).map((e: any) => [e.user_id as string, e.email as string]))

  const membersWithEmail = (members ?? []).map(m => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullName: (m.profiles as any)?.full_name ?? '—',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    avatarUrl: (m.profiles as any)?.avatar_url ?? null,
    email: emailMap.get(m.user_id) ?? '—',
  }))

  // Pending invites: user_ids in activity_log(action='invited') that don't show up
  // in current org_members. Surfaces orphan auth users created when the
  // org_members.insert silently failed (now fixed, but keep visibility for
  // historical orphans).
  const memberUserIds = new Set(membersWithEmail.map(m => m.userId))
  const seenInvites = new Map<string, { email: string; invitedAt: string }>()
  for (const row of (invitedActivity ?? []) as ActivityRow[]) {
    if (!row.entity_id || memberUserIds.has(row.entity_id) || seenInvites.has(row.entity_id)) continue
    const payloadEmail = (row.payload && typeof row.payload === 'object' && 'email' in row.payload)
      ? String((row.payload as Record<string, unknown>).email)
      : '—'
    seenInvites.set(row.entity_id, { email: payloadEmail, invitedAt: row.created_at })
  }
  const pendingInvites = Array.from(seenInvites.entries()).map(([userId, info]) => ({
    userId,
    email: info.email,
    invitedAt: info.invitedAt,
  }))

  return (
    <UsersView
      members={membersWithEmail}
      pendingInvites={pendingInvites}
      currentUserId={ctx.userId}
      currentRole={ctx.role}
    />
  )
}
