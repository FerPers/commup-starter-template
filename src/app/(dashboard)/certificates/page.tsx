import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import CertificatesGlobal from './CertificatesGlobal'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

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

  // S09 (B-07): PostgREST corta en 1000 filas → se pagina.
  const [{ rows: certificates, truncated }, { data: phases }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ rows: [], truncated: false })
      : fetchAllRowsFlagged(() => supabase
          .from('certificates')
          .select(`
            id, certificate_number, title, status, issued_date, project_id,
            projects(id, name, code),
            project_phases(id, code, name, color, certificate_name),
            subsystems(id, code, name, systems(code, name))
          `)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })),
    supabase
      .from('project_phases')
      .select('id, code, name, color, certificate_name')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <CertificatesGlobal
      projects={projects ?? []}
      certificates={certificates}
      phases={phases ?? []}
    />
    </>
  )
}
