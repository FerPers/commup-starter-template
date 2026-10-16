import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { EventCategory, Milestone, StartupEventStatus } from '@/lib/startup/catalog'
import EventsView from './EventsView'

// Bitácora de arranque (fase 6 plan readiness, sesión 2): franja de hitos por sistema, registro de
// eventos con foto IIoT y línea de tiempo.
export default async function StartupEventsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ system?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: systems }, { data: events }, { data: runs }, { data: signals }, { data: members }] = await Promise.all([
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('startup_events')
      .select('id, number, system_id, kind, milestone, category, occurred_at, title, status, recorded_by, witness_by, witness_at, witness_capacity, startup_event_params(id)')
      .eq('project_id', id).order('occurred_at', { ascending: false }).limit(1000),
    supabase.from('procedure_runs').select('id, number, system_id, status').eq('project_id', id).order('seq', { ascending: false }).limit(200),
    supabase.from('signals').select('id, signal_tag, signal_type, eng_unit, tags!inner(project_id, subsystems(system_id))').eq('tags.project_id', id).limit(2000),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  return (
    <EventsView
      project={project}
      systems={systems ?? []}
      initialSystemId={(systems ?? []).some(s => s.id === sp.system) ? sp.system! : ''}
      events={(events ?? []).map(e => ({
        id: e.id, number: e.number, systemId: e.system_id, kind: e.kind as 'milestone' | 'free',
        milestone: e.milestone as Milestone | null, category: e.category as EventCategory | null, occurredAt: e.occurred_at,
        title: e.title, status: e.status as StartupEventStatus, recordedBy: e.recorded_by, witnessBy: e.witness_by, witnessAt: e.witness_at,
        params: (e.startup_event_params ?? []).length,
      }))}
      runs={runs ?? []}
      signals={(signals ?? []).map(s => ({
        id: s.id, tag: s.signal_tag, type: s.signal_type, unit: s.eng_unit,
        systemId: (s.tags as unknown as { subsystems: { system_id: string } | null } | null)?.subsystems?.system_id ?? null,
      }))}
      names={names}
      canRecord={ctx.role !== 'client'}
    />
  )
}
