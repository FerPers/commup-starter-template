import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import KpiDashboard from './KpiDashboard'
import { getSubsystemKpis, getProjectSnapshots } from '@/app/actions/kpi-snapshots'
import { getProjectAlerts } from '@/app/actions/alerts'
import { fetchItrPhaseCounts, sumItr } from '@/lib/list/kpi-query'

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [
    { data: project },
    { data: phases },
    itrCounts,
    subsystemKpis,
    snapshots,
    alerts,
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
    fetchItrPhaseCounts(supabase, { projectId }),
    getSubsystemKpis(projectId),
    getProjectSnapshots(projectId),
    getProjectAlerts(projectId),
  ])

  if (!project) notFound()

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const phaseKpis = (phases ?? []).map(phase => {
    const total = sumItr(itrCounts, i => i.phase_id === phase.id)
    const approved = sumItr(itrCounts, i => i.phase_id === phase.id && i.status === 'approved')
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
      phaseKpis={phaseKpis}
      subsystemKpis={subsystemKpis}
      snapshots={snapshots}
      canEdit={canEdit}
      alerts={alerts}
    />
  )
}
