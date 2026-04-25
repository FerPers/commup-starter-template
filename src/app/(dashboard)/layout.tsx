import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import { ToastProvider } from '@/components/ui'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [{ count: punchCount }, { count: preservationCount }] = await Promise.all([
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
  ])

  const notifCounts = {
    punches: punchCount ?? 0,
    preservation: preservationCount ?? 0,
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
        <Sidebar notifCounts={notifCounts} />
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
