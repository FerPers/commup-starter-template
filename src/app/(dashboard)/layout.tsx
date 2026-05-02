import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import Topbar from '@/components/layout/Topbar'
import { ToastProvider } from '@/components/ui'
import type { OrgMemberRole } from '@/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: punchCount },
    { count: preservationCount },
    { data: membership },
  ] = await Promise.all([
    supabase
      .from('punches')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'A')
      .in('status', ['open', 'in_progress'])
      .is('assigned_to', null),
    supabase
      .from('preservation_records')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'completed')
      .lt('next_due_date', threeDaysAgo),
    supabase
      .from('org_members')
      .select('role, organizations(name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
  ])

  const notifCounts = {
    punches: punchCount ?? 0,
    preservation: preservationCount ?? 0,
  }

  // Authenticated users without an org go to /setup. This used to live in
  // src/proxy.ts but Next.js 16 + Cloudflare Workers don't allow proxy/middleware,
  // so the gate moved here.
  if (!membership) redirect('/setup')

  const role = (membership.role ?? null) as OrgMemberRole | null
  const orgRel = membership.organizations as { name: string } | { name: string }[] | null | undefined
  const orgName = Array.isArray(orgRel) ? (orgRel[0]?.name ?? null) : (orgRel?.name ?? null)

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
        <Sidebar notifCounts={notifCounts} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar role={role} orgName={orgName} userEmail={user.email ?? null} />
          <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
