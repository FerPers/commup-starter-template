import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { LOOKAHEAD_WINDOWS, type LookaheadWindow } from '@/lib/readiness/planning'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import LookaheadView, { type GateCell, type PlanSource } from './LookaheadView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import { ROLE_TIERS } from '@/lib/constants/roles'
import type { GateBlocker } from '@/lib/readiness/gates'
import { blockerCount } from '@/lib/readiness/matrix'

// Look-ahead 90/30/7 (fase 5 plan readiness, sesión 2): gates por forecast y compromiso + acciones,
// restricciones, TQ e ítems de work plan que vencen en la ventana, agrupados por sistema.
// La ventana y la base se eligen en el cliente: aquí se cargan todas las fechas vivas (≤ 90 días).
export default async function LookaheadPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ w?: string; edit?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  // S09 (D-24): PostgREST corta en 1000 filas aunque se pida .limit(2000); las fuentes vivas se paginan con .range().
  const [{ data: gatesRaw }, { data: plans }, actionsRes, constraintsRes, tqsRes, planItemsRes, { data: progress }] = await Promise.all([
    supabase.rpc('compute_project_gates', { p_project_id: id }),
    supabase.from('system_gate_plans').select('system_id, gate_id, forecast_date, commitment_date').eq('project_id', id),
    fetchAllRowsFlagged(() => supabase.from('actions').select('id, number, title, status, due_date, system_id')
      .eq('project_id', id).in('status', ['open', 'in_progress', 'done']).not('due_date', 'is', null)),
    fetchAllRowsFlagged(() => supabase.from('project_constraints').select('id, number, title, status, need_date, system_id, escalation_level')
      .eq('project_id', id).eq('status', 'open')),
    fetchAllRowsFlagged(() => supabase.from('technical_queries').select('id, number, subject, status, required_by, system_id')
      .eq('project_id', id).in('status', ['draft', 'issued']).not('required_by', 'is', null)),
    fetchAllRowsFlagged(() => supabase.from('work_plan_items')
      .select('id, title, status, planned_finish, work_plans!inner(project_id), itrs(itr_number, subsystems(system_id))')
      .eq('work_plans.project_id', id).in('status', ['not_started', 'in_progress']).not('planned_finish', 'is', null)),
    supabase.rpc('compute_project_progress', { p_project_id: id }),
  ])

  const actions = actionsRes.rows
  const constraints = constraintsRes.rows
  const tqs = tqsRes.rows
  const planItems = planItemsRes.rows
  const truncated = actionsRes.truncated || constraintsRes.truncated || tqsRes.truncated || planItemsRes.truncated

  type GateJson = { gate_id: string; code: string; name: string; order: number; status: string; blocker?: GateBlocker | null }
  const tg = await getTranslations('Gates')
  // S23 (D-26): el primer criterio que falla, del estado guardado de S20 (sin recalcular nada).
  const blockerText = (b: GateBlocker | null | undefined) => {
    if (!b) return null
    const n = blockerCount(b)
    return `${b.label ?? tg(`kind.${b.kind}`)}${n ? ` (${n})` : ''}`
  }
  const systems = ((gatesRaw ?? []) as unknown as { system_id: string; system_code: string; system_name: string; gates: GateJson[] }[])
  const planMap = new Map((plans ?? []).map(p => [`${p.system_id}:${p.gate_id}`, p]))
  const cells: GateCell[] = systems.flatMap(s => s.gates.map(g => {
    const plan = planMap.get(`${s.system_id}:${g.gate_id}`)
    return {
      systemId: s.system_id, systemCode: s.system_code, systemName: s.system_name,
      gateId: g.gate_id, gateCode: g.code, gateName: g.name, gateOrder: g.order, status: g.status,
      forecast: plan?.forecast_date ?? null, commitment: plan?.commitment_date ?? null,
      blocker: g.status === 'not_ready' || g.status === 'regressed' ? blockerText(g.blocker) : null,
    }
  }))
  const codeOf = new Map(systems.map(s => [s.system_id, s.system_code]))

  const sources: Omit<PlanSource, 'systemCode'>[] = [
    ...actions.map(a => ({ kind: 'action' as const, id: a.id, ref: a.number, title: a.title, status: a.status, date: a.due_date!, systemId: a.system_id })),
    ...constraints.map(c => ({ kind: 'constraint' as const, id: c.id, ref: c.number, title: c.title, status: c.status, date: c.need_date, systemId: c.system_id, level: c.escalation_level })),
    ...tqs.map(q => ({ kind: 'tq' as const, id: q.id, ref: q.number, title: q.subject, status: q.status, date: q.required_by!, systemId: q.system_id })),
    ...planItems.map(w => {
      const itr = w.itrs as unknown as { itr_number: string; subsystems: { system_id: string } | null } | null
      return { kind: 'work_plan' as const, id: w.id, ref: itr?.itr_number ?? 'WP', title: w.title ?? itr?.itr_number ?? '', status: w.status, date: w.planned_finish!, systemId: itr?.subsystems?.system_id ?? null }
    }),
  ]

  const win = Number(sp.w) as LookaheadWindow
  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <LookaheadView
      project={project}
      initialWindow={LOOKAHEAD_WINDOWS.includes(win) ? win : 30}
      initialEdit={sp.edit === '1' && ctx.role !== 'client'}
      cells={cells}
      sources={sources.map(x => ({ ...x, systemCode: x.systemId ? codeOf.get(x.systemId) ?? null : null }))}
      progress={(progress ?? []).map(p => ({ systemId: p.system_id, systemCode: p.system_code, weightedPct: Number(p.weighted_pct), itrTotal: p.itr_total, gatesApproved: p.gates_approved, gatesTotal: p.gates_total }))}
      canEdit={ctx.role !== 'client'}
      canCommit={ROLE_TIERS.editor.includes(ctx.role)}
    />
    </>
  )
}
