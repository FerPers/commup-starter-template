import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import Topbar from '@/components/layout/Topbar'
import { ToastProvider } from '@/components/ui'
import { getActiveMembership, listMemberships } from '@/lib/supabase/membership'
import type { OrgMemberRole } from '@/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMembership()
  if (!ctx) {
    // Could be unauthenticated OR authenticated-without-membership.
    // Try one more lookup to disambiguate, then redirect.
    const memberships = await listMemberships()
    if (memberships.length === 0) {
      // We don't know if user is unauthenticated; the helper returns null in
      // both cases. /login is safe — it'll bounce authenticated users to /setup
      // via (auth) layout if they have no memberships.
      redirect('/login')
    }
    // Edge case: cookie pointed to a non-membership and no fallback worked.
    // listMemberships found rows but getActiveMembership did not — should not
    // happen, but if it does, force re-pick.
    redirect('/login')
  }

  const supabase = ctx.supabase
  // eslint-disable-next-line react-hooks/purity -- Server Component: runs once per request, not on client render
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: orgProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', ctx.orgId)

  const projectIds = (orgProjects ?? []).map(p => p.id)

  const [
    { count: punchCount },
    { count: preservationCount },
    { count: unreadNotificationsCount },
    { data: org },
    memberships,
  ] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('punches')
          .select('*', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .eq('category', 'A')
          .in('status', ['open', 'in_progress']),
    projectIds.length === 0
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('preservation_plans')
          .select('*', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .neq('status', 'completed')
          .lt('next_due_date', threeDaysAgo),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', ctx.userId)
      .eq('org_id', ctx.orgId)
      .is('read_at', null),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', ctx.orgId)
      .maybeSingle(),
    listMemberships(),
  ])

  const notifCounts = {
    punches: punchCount ?? 0,
    preservation: preservationCount ?? 0,
  }

  const role = ctx.role as OrgMemberRole
  const orgName = org?.name ?? null

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
        <Sidebar notifCounts={notifCounts} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar
            role={role}
            orgName={orgName}
            activeOrgId={ctx.orgId}
            memberships={memberships}
            userEmail={ctx.userEmail}
            userId={ctx.userId}
            unreadNotifications={unreadNotificationsCount ?? 0}
          />
          <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
