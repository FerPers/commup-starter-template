import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OrgConfigView from './OrgConfigView'

export default async function AdminConfigPage() {
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

  const [{ data: org }, { data: phases }, { data: disciplines }, { data: projects }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index, certificate_name')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', orgId)
      .order('code'),
    supabase
      .from('projects')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name'),
  ])

  return (
    <OrgConfigView
      org={org ?? { id: orgId, name: '', logo_url: null }}
      phases={phases ?? []}
      disciplines={disciplines ?? []}
      projects={projects ?? []}
    />
  )
}
