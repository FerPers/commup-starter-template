import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { KpiCard, type KpiDelta } from './_shared'
import { fetchItrPhaseCounts, fetchPunchCounts, fetchPreservationDueCounts, sumItr, sumPunch, isOpenPunch } from '@/lib/list/kpi-query'

export default async function KpiSummaryWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)

  const projectIds = (projects ?? []).map(p => p.id)

  const ago7 = new Date()
  ago7.setDate(ago7.getDate() - 7)
  const ago7Str = ago7.toISOString().split('T')[0]

  // Sprint E: conteos de ITRs y punches en SQL (antes: todas las filas de la org)
  const [{ data: phases }, orgItrs, orgPunches, preservation] = await Promise.all([
    supabase
      .from('project_phases')
      .select('id, name, code, color, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    fetchItrPhaseCounts(supabase, { orgId }),
    fetchPunchCounts(supabase, { orgId }),
    fetchPreservationDueCounts(supabase, projectIds, 7),
  ])

  const openCount = sumPunch(orgPunches, isOpenPunch)
  const catA = sumPunch(orgPunches, p => isOpenPunch(p) && p.category === 'A')
  const catB = sumPunch(orgPunches, p => isOpenPunch(p) && p.category === 'B')

  // S09 (B-24): vencida = definición única de SQL (preservation_is_overdue); por vencer = próximos 7 días
  const overdue = preservation.reduce((a, r) => a + r.overdue, 0)
  const upcoming = preservation.reduce((a, r) => a + r.due_soon, 0)

  // ── Deltas vs hace 7 días (kpi_snapshots, cron diario 02:00 UTC) ─────────
  // Fases: snapshots por (project, phase) agregados a nivel org.
  // Punches: snapshots a nivel proyecto (phase_id null) — historial ya existente.
  const phasePctAgo = new Map<string, number>() // phase_id → pct agregado hace ~7d
  let punchesOpenAgo: number | null = null

  if (projectIds.length > 0) {
    // Fecha comparable más reciente con antigüedad >= 7 días, por tipo de snapshot
    const [{ data: phaseDateRow }, { data: projDateRow }] = await Promise.all([
      supabase
        .from('kpi_snapshots')
        .select('snapshot_date')
        .in('project_id', projectIds)
        .not('phase_id', 'is', null)
        .lte('snapshot_date', ago7Str)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('kpi_snapshots')
        .select('snapshot_date')
        .in('project_id', projectIds)
        .is('phase_id', null)
        .is('subsystem_id', null)
        .lte('snapshot_date', ago7Str)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const [phaseSnapRes, projSnapRes] = await Promise.all([
      phaseDateRow?.snapshot_date
        // bounded: una fecha × proyectos × fases de la org
        ? supabase
            .from('kpi_snapshots')
            .select('phase_id, total_itrs, completed_itrs')
            .in('project_id', projectIds)
            .not('phase_id', 'is', null)
            .eq('snapshot_date', phaseDateRow.snapshot_date)
        : Promise.resolve({ data: null }),
      projDateRow?.snapshot_date
        // bounded: una fila por proyecto de la org en esa fecha
        ? supabase
            .from('kpi_snapshots')
            .select('open_punches_a, open_punches_b')
            .in('project_id', projectIds)
            .is('phase_id', null)
            .is('subsystem_id', null)
            .eq('snapshot_date', projDateRow.snapshot_date)
        : Promise.resolve({ data: null }),
    ])

    if (phaseSnapRes.data) {
      const agg = new Map<string, { total: number; done: number }>()
      for (const row of phaseSnapRes.data) {
        if (!row.phase_id) continue
        const cur = agg.get(row.phase_id) ?? { total: 0, done: 0 }
        cur.total += row.total_itrs ?? 0
        cur.done += row.completed_itrs ?? 0
        agg.set(row.phase_id, cur)
      }
      for (const [phaseId, { total, done }] of agg) {
        phasePctAgo.set(phaseId, total > 0 ? Math.round((done / total) * 100) : 0)
      }
    }

    if (projSnapRes.data) {
      punchesOpenAgo = projSnapRes.data.reduce(
        (sum, r) => sum + (r.open_punches_a ?? 0) + (r.open_punches_b ?? 0), 0,
      )
    }
  }

  // open.length incluye Cat C; el snapshot solo graba A+B — comparar A+B con A+B
  const openAB = catA + catB
  const punchDelta: KpiDelta = {
    value: punchesOpenAgo === null ? null : openAB - punchesOpenAgo,
    goodWhenUp: false,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {(phases ?? []).map(phase => {
        const phaseTotal = sumItr(orgItrs, i => i.phase_id === phase.id)
        const phaseApproved = sumItr(orgItrs, i => i.phase_id === phase.id && i.status === 'approved')
        const total = phaseTotal
        const approved = phaseApproved
        const pct = total > 0 ? Math.round((approved / total) * 100) : 0
        const ago = phasePctAgo.get(phase.id)
        const delta: KpiDelta = { value: ago === undefined ? null : pct - ago, goodWhenUp: true }
        return <KpiCard key={phase.id} label={phase.name} value={`${pct}%`} color={phase.color} sub={`${approved} / ${total} ITRs`} progress={pct} delta={delta} />
      })}
      <KpiCard label={t('kpi.punchesOpen')} value={String(openCount)} color='var(--danger-700)' sub={t('kpi.punchesOpenSub', { catA, catB })} danger delta={punchDelta} />
      <KpiCard
        label={t('kpi.preservation')}
        value={String(overdue + upcoming)}
        color={overdue > 0 ? 'var(--warning-700)' : 'var(--violet-700)'}
        sub={overdue > 0 ? t('kpi.preservationOverdue', { overdue, upcoming }) : t('kpi.preservationUpcoming', { upcoming })}
        danger={overdue > 0}
      />
    </div>
  )
}
