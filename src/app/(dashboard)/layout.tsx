import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import HeldCaptures from '@/components/offline/HeldCaptures'
import DeniedNotice from '@/components/layout/DeniedNotice'
import Sidebar from '@/components/layout/sidebar'
import Topbar from '@/components/layout/Topbar'
import DashboardShell from '@/components/layout/DashboardShell'
import MobileMenuButton from '@/components/layout/MobileMenuButton'
import MobileTabBar from '@/components/layout/MobileTabBar'
import { FIELD_ROLES } from '@/lib/constants/navigation'
import { ToastProvider } from '@/components/ui'
import { getActiveMembership, getMyWorkCounts, listInactiveMemberships, listMemberships } from '@/lib/supabase/membership'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import { badgeTotal, parseCounts } from '@/lib/my-work/queues'
import { fetchPreservationDueCounts } from '@/lib/list/kpi-query'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMembership()
  if (!ctx) {
    // S15 (I-21): con invitaciones por aceptar o acceso suspendido/vencido, la página /access lo explica.
    if ((await listInactiveMemberships()).length > 0) redirect('/access')
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

  // S20 (B-23): lo que no depende de los proyectos sale en paralelo con ellos (cada await secuencial paga el RTT a Supabase).
  const [
    { data: orgProjects },
    { count: unreadNotificationsCount },
    { data: org },
    memberships,
    myWorkRaw,
    { data: profile },
    pendingInvitations,
  ] = await Promise.all([
    supabase.from('projects').select('id, name').eq('org_id', ctx.orgId),
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
    // Sprint N: contadores personales para el badge de «Mi trabajo» (RLS del usuario; S20: una vez por request)
    getMyWorkCounts(ctx.orgId),
    supabase.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle(),
    listInactiveMemberships().then(ms => ms.filter(m => m.state === 'invited')),
  ])

  const projectIds = (orgProjects ?? []).map(p => p.id)
  const projectNames: Record<string, string> = Object.fromEntries(
    (orgProjects ?? []).map(p => [p.id, p.name])
  )

  // N0 (H-16): solo los conteos que algún badge muestra (el de punch Cat A no lo usaba nadie).
  // S09 (B-24): misma definición de «vencida» que Mi trabajo, dashboard y snapshot (sin tolerancia de 3 días)
  const preservationCount = await fetchPreservationDueCounts(supabase, projectIds)
    .then(rows => rows.reduce((a, r) => a + r.overdue, 0))
    .catch(() => 0)
  const tAccess = await getTranslations('Access')

  const role = ctx.role as OrgMemberRole
  const notifCounts = {
    preservation: preservationCount,
    myWork: badgeTotal(parseCounts(myWorkRaw), role),
    inbox: unreadNotificationsCount ?? 0,
  }
  const orgName = org?.name ?? null

  return (
    <ToastProvider>
      <DashboardShell
        sidebar={<Sidebar notifCounts={notifCounts} role={role} projectNames={projectNames} />}
        tabbar={FIELD_ROLES.includes(role)
          ? <MobileTabBar counts={{ myWork: notifCounts.myWork }} role={role} projects={(orgProjects ?? []).map(p => ({ id: p.id, name: p.name }))} />
          : null}
        topbar={
          <Topbar
            role={role}
            orgName={orgName}
            activeOrgId={ctx.orgId}
            memberships={memberships}
            userEmail={ctx.userEmail}
            userName={profile?.full_name ?? null}
            userId={ctx.userId}
            unreadNotifications={unreadNotificationsCount ?? 0}
            projectNames={projectNames}
          >
            <MobileMenuButton />
          </Topbar>
        }
      >
        <HeldCaptures userId={ctx.userId} />
        <Suspense fallback={null}><DeniedNotice role={role} /></Suspense>
        {pendingInvitations.length > 0 && (
          <div role="status" style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 8, background: 'var(--primary-50)', border: '1px solid var(--primary-200)', color: 'var(--primary-700)', fontSize: 13 }}>
            {tAccess('banner', { n: pendingInvitations.length, org: pendingInvitations[0].orgName })}{' '}
            <Link href="/access" style={{ fontWeight: 600, color: 'var(--primary-700)' }}>{tAccess('review')}</Link>
          </div>
        )}
        {children}
      </DashboardShell>
    </ToastProvider>
  )
}
