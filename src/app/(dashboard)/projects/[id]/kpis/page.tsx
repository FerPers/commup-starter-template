import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import KpiDashboard from './KpiDashboard'
import { getSubsystemKpis, getProjectSnapshots } from '@/app/actions/kpi-snapshots'

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

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

  const [
    { data: project },
    { data: phases },
    { data: itrs },
    subsystemKpis,
    snapshots,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, start_date, end_date')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
    supabase
      .from('itrs')
      .select('id, status, phase_id')
      .eq('project_id', projectId),
    getSubsystemKpis(projectId),
    getProjectSnapshots(projectId),
  ])

  if (!project) notFound()

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const phaseKpis = (phases ?? []).map(phase => {
    const phaseItrs = (itrs ?? []).filter(i => i.phase_id === phase.id)
    const total = phaseItrs.length
    const approved = phaseItrs.filter(i => i.status === 'approved').length
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return { id: phase.id, code: phase.code, name: phase.name, color: phase.color, total, approved, pct }
  })

  return (
    <KpiDashboard
      projectId={projectId}
      projectName={project.name}
      projectCode={project.code}
      startDate={project.start_date}
      endDate={project.end_date}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phaseKpis={phaseKpis as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subsystemKpis={subsystemKpis as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshots={snapshots as any}
      canEdit={canEdit}
    />
  )
}
