import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsersView from './UsersView'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')
  if (!['owner', 'admin'].includes(membership.role)) redirect('/dashboard')

  const orgId = membership.org_id

  const [{ data: members }, { data: emails }] = await Promise.all([
    supabase
      .from('org_members')
      .select('id, user_id, role, joined_at, profiles(full_name, avatar_url)')
      .eq('org_id', orgId)
      .order('joined_at'),
    supabase.rpc('get_org_member_emails', { p_org_id: orgId }),
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

  return (
    <UsersView
      members={membersWithEmail}
      currentUserId={user.id}
      currentRole={membership.role}
    />
  )
}
