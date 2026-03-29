import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const PRIVILEGED_ROLES = ['owner', 'admin', 'architect']

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check org membership and role
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  // User has an org but lacks a privileged role → no access to wizard
  if (membership && !PRIVILEGED_ROLES.includes(membership.role)) {
    redirect('/dashboard')
  }

  // No membership = first-time setup (allowed, will become owner)
  // Privileged role = allowed to create new projects
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {children}
    </div>
  )
}
