import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import CertificatesGlobal from './CertificatesGlobal'

export default async function GlobalCertificatesPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('org_id', membership.org_id)
    .order('name')

  const projectIds = (projects ?? []).map(p => p.id)

  const [{ data: certificates }, { data: phases }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('certificates')
          .select(`
            id, certificate_number, title, status, issued_date, project_id,
            projects(id, name, code),
            project_phases(id, code, name, color, certificate_name),
            subsystems(id, code, name, systems(code, name))
          `)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color, certificate_name')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  return (
    <CertificatesGlobal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      certificates={(certificates ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phases={(phases ?? []) as any}
    />
  )
}
