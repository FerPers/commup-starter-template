import { fetchItrPhaseCounts, fetchPunchCounts, sumItr, sumPunch, isOpenPunch } from '@/lib/list/kpi-query'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
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
    itrCounts,
    punchCounts,
    subsystemKpis,
    snapshots,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, client, location, start_date, end_date, timezone')
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
    // S09 (F-04): conteos SQL (antes: punches abiertos cortados en 1000 → Cat A/B subcontados)
    fetchItrPhaseCounts(supabase, { projectId }),
    fetchPunchCounts(supabase, { projectId }),
    getSubsystemKpis(projectId),
    getProjectSnapshots(projectId),
  ])

  if (!project) notFound()

  const phaseKpis = (phases ?? []).map(phase => {
    const total = sumItr(itrCounts, i => i.phase_id === phase.id)
    const approved = sumItr(itrCounts, i => i.phase_id === phase.id && i.status === 'approved')
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return { id: phase.id, code: phase.code, name: phase.name, color: phase.color, total, approved, pct }
  })

  const totalItrs = phaseKpis.reduce((s, p) => s + p.total, 0)
  const totalApproved = phaseKpis.reduce((s, p) => s + p.approved, 0)
  const overallPct = totalItrs > 0 ? Math.round((totalApproved / totalItrs) * 100) : 0
  const openCatA = sumPunch(punchCounts, p => isOpenPunch(p) && p.category === 'A')
  const openCatB = sumPunch(punchCounts, p => isOpenPunch(p) && p.category === 'B')
  const lastSnapshot = snapshots[snapshots.length - 1]
  const snapshotNum = snapshots.length

  // «Hoy» en la zona del proyecto (S10), en el idioma del usuario.
  const locale = await getLocale()
  const reportDate = new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'es-CO', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: project.timezone ?? 'America/Bogota',
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
