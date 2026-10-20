import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import KpiDashboard from './KpiDashboard'
import ReadinessKpis, { type MgmtSnapshot } from './ReadinessKpis'
import { addDays, plannedCurve, type PlanSystem } from '@/lib/readiness/planning'
import { todayIn } from '@/lib/time/zone'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { getSubsystemKpis, getProjectSnapshots } from '@/app/actions/kpi-snapshots'
import { getProjectAlerts } from '@/app/actions/alerts'
import { fetchItrPhaseCounts, sumItr } from '@/lib/list/kpi-query'
import { ROLE_TIERS } from '@/lib/constants/roles'

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
      .select('id, name, code, start_date, end_date, timezone')
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

  const canEdit = ROLE_TIERS.editor.includes(membership.role)

  const phaseKpis = (phases ?? []).map(phase => {
    const total = sumItr(itrCounts, i => i.phase_id === phase.id)
    const approved = sumItr(itrCounts, i => i.phase_id === phase.id && i.status === 'approved')
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return { id: phase.id, code: phase.code, name: phase.name, color: phase.color, total, approved, pct }
  })

  // Readiness (fase 5, sesión 2): avance ponderado en vivo + snapshots diarios (curva S, KPIs).
  const since = addDays(todayIn(project.timezone), -180)
  const [{ data: progress }, { data: mgmtSnaps }, { data: commitments }] = await Promise.all([
    supabase.rpc('compute_project_progress', { p_project_id: projectId }),
    supabase.from('mgmt_kpi_snapshots').select('snapshot_date, weighted_pct, gates_approved, gates_total, kpis')
      .eq('project_id', projectId).gte('snapshot_date', since).order('snapshot_date'),
    // Clave única (system_id, gate_id): orden por sistema + clave gate_id del helper.
    fetchAllRows(() => supabase.from('system_gate_plans').select('system_id, gate_id, commitment_date')
      .eq('project_id', projectId).not('commitment_date', 'is', null).order('system_id'), { key: 'gate_id' }).then(rows => ({ data: rows })),
  ])

  // S10 (D-27): línea base desde los compromisos por gate, con los pesos y los ITR del último snapshot por sistema.
  const lastSnap = mgmtSnaps?.at(-1)?.snapshot_date
  const sysSnaps = lastSnap
    ? await fetchAllRows(() => supabase.from('system_progress_snapshots').select('id, system_id, itr_total, per_gate')
      .eq('project_id', projectId).eq('snapshot_date', lastSnap))
    : []
  const planSystems: PlanSystem[] = sysSnaps.map(s => ({
    systemId: s.system_id, itrTotal: s.itr_total,
    gates: ((s.per_gate ?? []) as { gate_id: string; weight: number; itr_total: number }[])
      .map(g => ({ gateId: g.gate_id, weight: Number(g.weight), itrTotal: g.itr_total })),
  }))
  const plan = (commitments ?? []).map(c => ({ systemId: c.system_id, gateId: c.gate_id, date: c.commitment_date as string }))
  const planDates = Array.from(new Set([...(mgmtSnaps ?? []).map(m => m.snapshot_date), ...plan.map(p => p.date)]))
    .filter(d => d >= since).sort()
  const planPcts = plan.length > 0 && planSystems.length > 0 ? plannedCurve(planSystems, plan, planDates) : []
  const itrSum = (progress ?? []).reduce((sum, p) => sum + p.itr_total, 0)
  const livePct = itrSum > 0 ? (progress ?? []).reduce((sum, p) => sum + Number(p.weighted_pct) * p.itr_total, 0) / itrSum : 0

  return (
    <>
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
    <ReadinessKpis
      projectId={projectId}
      livePct={livePct}
      liveGates={{
        approved: (progress ?? []).reduce((sum, p) => sum + p.gates_approved, 0),
        total: (progress ?? []).reduce((sum, p) => sum + p.gates_total, 0),
      }}
      snapshots={(mgmtSnaps ?? []).map(m => ({ ...m, weighted_pct: Number(m.weighted_pct), kpis: m.kpis as MgmtSnapshot['kpis'] }))}
      plan={planPcts.map((pct, i) => ({ date: planDates[i], pct }))}
    />
    </>
  )
}
