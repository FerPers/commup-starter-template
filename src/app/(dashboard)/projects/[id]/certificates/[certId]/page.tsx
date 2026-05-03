import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import CertificateDetail from './CertificateDetail'

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string; certId: string }>
}) {
  const { id: projectId, certId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  // Fetch certificate + relations
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code, client, location')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  const [
    { data: cert },
    { data: exceptions },
  ] = await Promise.all([
    supabase
      .from('certificates')
      .select(`
        id, certificate_number, title, status,
        issued_date, notes, created_at,
        project_phases(id, code, name, color, certificate_name),
        subsystems(id, code, name, systems(id, code, name)),
        issued_by_profile:profiles!issued_by(id, full_name)
      `)
      .eq('id', certId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('certificate_punch_exceptions')
      .select(`
        id, justification, approved_at,
        punches(id, punch_number, description, category, status),
        approved_by_profile:profiles!approved_by(id, full_name)
      `)
      .eq('certificate_id', certId)
      .order('approved_at'),
  ])

  if (!cert) notFound()

  // Fetch ITRs for this subsystem + phase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subsystemId = (cert as any).subsystems?.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phaseId = (cert as any).project_phases?.id

  const { data: itrs } = subsystemId && phaseId
    ? await supabase
        .from('itrs')
        .select(`
          id, itr_number, status, progress_pct, created_at,
          itr_templates(code, title),
          tags(tag_number, description)
        `)
        .eq('project_id', projectId)
        .eq('subsystem_id', subsystemId)
        .eq('phase_id', phaseId)
        .order('itr_number')
    : { data: [] }

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)
  const isAdmin = ['owner', 'admin'].includes(membership.role)

  return (
    <CertificateDetail
      projectId={projectId}
      projectName={project.name}
      projectCode={project.code}
      projectClient={project.client ?? null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cert={cert as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exceptions={(exceptions ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itrs={(itrs ?? []) as any}
      canEdit={canEdit}
      isAdmin={isAdmin}
    />
  )
}
