import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { KpiCard } from './_shared'

export default async function KpiSummaryWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)

  const projectIds = (projects ?? []).map(p => p.id)

  const in7Days = new Date()
  in7Days.setDate(in7Days.getDate() + 7)
  const in7DaysStr = in7Days.toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [{ data: phases }, { data: orgItrs }, { data: orgPunches }, { data: orgPreservationDue }] = await Promise.all([
    supabase
      .from('project_phases')
      .select('id, name, code, color, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    projectIds.length > 0
      ? supabase.from('itrs').select('id, status, phase_id').in('project_id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length > 0
      ? supabase.from('punches').select('id, category, status').in('project_id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length > 0
      ? supabase
          .from('preservation_plans')
          .select('id, next_due_date')
          .in('project_id', projectIds)
          .eq('status', 'active')
          .lte('next_due_date', in7DaysStr)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const open = (orgPunches ?? []).filter((p: any) => p.status !== 'closed' && p.status !== 'cancelled')
  const catA = open.filter((p: any) => p.category === 'A').length
  const catB = open.filter((p: any) => p.category === 'B').length

  const due = orgPreservationDue ?? []
  const overdue = (due as any[]).filter(p => p.next_due_date < today).length
  const upcoming = (due as any[]).filter(p => p.next_due_date >= today).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {(phases ?? []).slice(0, 3).map(phase => {
        const phaseItrs = (orgItrs ?? []).filter((i: any) => i.phase_id === phase.id)
        const total = phaseItrs.length
        const approved = phaseItrs.filter((i: any) => i.status === 'approved').length
        const pct = total > 0 ? Math.round((approved / total) * 100) : 0
        return <KpiCard key={phase.id} label={phase.name} value={`${pct}%`} color={phase.color} sub={`${approved} / ${total} ITRs`} progress={pct} />
      })}
      <KpiCard label={t('kpi.punchesOpen')} value={String(open.length)} color="var(--danger-500)" sub={t('kpi.punchesOpenSub', { catA, catB })} danger />
      <KpiCard
        label={t('kpi.preservation')}
        value={String(due.length)}
        color={overdue > 0 ? 'var(--warning-500)' : '#8b5cf6'}
        sub={overdue > 0 ? t('kpi.preservationOverdue', { overdue, upcoming }) : t('kpi.preservationUpcoming', { upcoming })}
        danger={overdue > 0}
      />
    </div>
  )
}
