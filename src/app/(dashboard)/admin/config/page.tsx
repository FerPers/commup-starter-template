import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import OrgConfigView from './OrgConfigView'

export default async function AdminConfigPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
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
