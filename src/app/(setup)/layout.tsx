import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { isActiveMembership } from '@/lib/members/catalog'

const PRIVILEGED_ROLES = ROLE_TIERS.privileged

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check org membership and role
  const { data: memberships } = await supabase
    .from('org_members')
    .select('role, status, access_expires_at')
    .eq('user_id', user.id)

  // User has an org but lacks an active privileged role → no access to wizard.
  // S15 (I-21): invitaciones, suspendidas o vencidas cuentan como «tiene org» (van a /access desde /home).
  const rows = memberships ?? []
  if (rows.length > 0 && !rows.some(m => isActiveMembership(m) && PRIVILEGED_ROLES.includes(m.role))) {
    redirect('/home')
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
