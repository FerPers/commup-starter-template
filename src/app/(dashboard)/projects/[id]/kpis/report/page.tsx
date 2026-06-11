import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ReportPrint from './ReportPrint'
import { getSubsystemKpis, getProjectSnapshots } from '@/app/actions/kpi-snapshots'

export default async function KpiReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [
    { data: project },
    { data: org },
    { data: phases },
    { data: itrs },
    { data: openPunches },
    subsystemKpis,
    snapshots,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, client, location, start_date, end_date')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', membership.org_id)
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
    supabase
      .from('punches')
      .select('id, category, status')
      .eq('project_id', projectId)
      .not('status', 'in', '(closed,cancelled)'),
    getSubsystemKpis(projectId),
    getProjectSnapshots(projectId),
  ])

  if (!project) notFound()

  const phaseKpis = (phases ?? []).map(phase => {
    const phaseItrs = (itrs ?? []).filter(i => i.phase_id === phase.id)
    const total = phaseItrs.length
    const approved = phaseItrs.filter(i => i.status === 'approved').length
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return { id: phase.id, code: phase.code, name: phase.name, color: phase.color, total, approved, pct }
  })

  const totalItrs = phaseKpis.reduce((s, p) => s + p.total, 0)
  const totalApproved = phaseKpis.reduce((s, p) => s + p.approved, 0)
  const overallPct = totalItrs > 0 ? Math.round((totalApproved / totalItrs) * 100) : 0
  const openCatA = (openPunches ?? []).filter(p => p.category === 'A').length
  const openCatB = (openPunches ?? []).filter(p => p.category === 'B').length
  const lastSnapshot = snapshots[snapshots.length - 1]
  const snapshotNum = snapshots.length

  const reportDate = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <ReportPrint
      projectId={projectId}
      projectName={project.name}
      projectCode={project.code}
      projectClient={project.client}
      projectLocation={project.location}
      startDate={project.start_date}
      endDate={project.end_date}
      orgName={org?.name ?? ''}
      reportDate={reportDate}
      snapshotDate={lastSnapshot?.snapshot_date ?? reportDate}
      snapshotNum={snapshotNum}
      overallPct={overallPct}
      totalItrs={totalItrs}
      totalApproved={totalApproved}
      openCatA={openCatA}
      openCatB={openCatB}
      phaseKpis={phaseKpis}
      subsystemKpis={subsystemKpis}
    />
  )
}
