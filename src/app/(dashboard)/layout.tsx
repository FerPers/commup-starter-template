import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import Topbar from '@/components/layout/Topbar'
import DashboardShell from '@/components/layout/DashboardShell'
import MobileMenuButton from '@/components/layout/MobileMenuButton'
import { ToastProvider } from '@/components/ui'
import { getActiveMembership, listMemberships } from '@/lib/supabase/membership'
import type { OrgMemberRole } from '@/types/database'
import { badgeTotal, parseCounts } from '@/lib/my-work/queues'

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
    .select('id, name')
    .eq('org_id', ctx.orgId)

  const projectIds = (orgProjects ?? []).map(p => p.id)
  const projectNames: Record<string, string> = Object.fromEntries(
    (orgProjects ?? []).map(p => [p.id, p.name])
  )

  const [
    { count: punchCount },
    { count: preservationCount },
    { count: unreadNotificationsCount },
    { data: org },
    memberships,
    { data: myWorkRaw },
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
    // Sprint N: contadores personales para el badge de «Mi trabajo» (RLS del usuario)
    supabase.rpc('my_work_counts', { p_org_id: ctx.orgId }),
  ])

  const role = ctx.role as OrgMemberRole
  const notifCounts = {
    punches: punchCount ?? 0,
    preservation: preservationCount ?? 0,
    myWork: badgeTotal(parseCounts(myWorkRaw), role),
    inbox: unreadNotificationsCount ?? 0,
  }
  const orgName = org?.name ?? null

  return (
    <ToastProvider>
      <DashboardShell
        sidebar={<Sidebar notifCounts={notifCounts} role={role} projectNames={projectNames} />}
        topbar={
          <Topbar
            role={role}
            orgName={orgName}
            activeOrgId={ctx.orgId}
            memberships={memberships}
            userEmail={ctx.userEmail}
            userId={ctx.userId}
            unreadNotifications={unreadNotificationsCount ?? 0}
            projectNames={projectNames}
          >
            <MobileMenuButton />
          </Topbar>
        }
      >
        {children}
      </DashboardShell>
    </ToastProvider>
  )
}
