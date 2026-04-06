import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CertificatesGlobal from './CertificatesGlobal'

export default async function GlobalCertificatesPage() {
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

  const [{ data: projects }, { data: certificates }, { data: phases }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('certificates')
      .select(`
        id, certificate_number, title, status, issued_date, project_id,
        projects(id, name, code),
        project_phases(id, code, name, color, certificate_name),
        subsystems(id, code, name, systems(code, name))
      `)
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
