import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { EventCategory, Milestone, StartupEventStatus } from '@/lib/startup/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import EventsView from './EventsView'
import { loadTagContext } from '@/lib/create/tag-context'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// Bitácora de arranque (fase 6 plan readiness, sesión 2): franja de hitos por sistema, registro de
// eventos con foto IIoT y línea de tiempo.
export default async function StartupEventsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ system?: string; tag?: string; new?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  // S09 (E-20): PostgREST corta en 1000 filas. La bitácora (de ella sale la franja de hitos vigentes por sistema)
  // y el catálogo de señales se paginan completos; los intentos de procedimiento son un selector de recientes (200).
  const [{ data: systems }, eventsRes, { data: runs }, signalsRes, { data: members }, tag] = await Promise.all([
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    fetchAllRowsFlagged(() => supabase.from('startup_events')
      .select('id, number, system_id, kind, milestone, category, occurred_at, title, status, recorded_by, witness_by, witness_at, witness_capacity, startup_event_params(id)')
      .eq('project_id', id).order('occurred_at', { ascending: false })),
    supabase.from('procedure_runs').select('id, number, system_id, status').eq('project_id', id).order('seq', { ascending: false }).limit(200),
    fetchAllRowsFlagged(() => supabase.from('signals').select('id, signal_tag, signal_type, eng_unit, tags!inner(project_id, subsystems(system_id))')
      .eq('tags.project_id', id).order('signal_tag')),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    loadTagContext(supabase, id, sp.tag),
  ])
  const events = eventsRes.rows
  const signals = signalsRes.rows
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  const tl = await getTranslations('Common')
  return (
    <>
    {(eventsRes.truncated || signalsRes.truncated) && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <EventsView
      project={project}
      systems={systems ?? []}
      initialSystemId={(systems ?? []).find(s => s.id === (sp.system ?? tag?.systemId))?.id ?? ''}
      initialOpen={sp.new === '1'}
      initialTag={tag ? { tag_id: tag.id, tag_number: tag.tagNumber } : null}
      events={events.map(e => ({
        id: e.id, number: e.number, systemId: e.system_id, kind: e.kind as 'milestone' | 'free',
        milestone: e.milestone as Milestone | null, category: e.category as EventCategory | null, occurredAt: e.occurred_at,
        title: e.title, status: e.status as StartupEventStatus, recordedBy: e.recorded_by, witnessBy: e.witness_by, witnessAt: e.witness_at,
        params: (e.startup_event_params ?? []).length,
      }))}
      runs={runs ?? []}
      signals={signals.map(s => ({
        id: s.id, tag: s.signal_tag, type: s.signal_type, unit: s.eng_unit,
        systemId: (s.tags as unknown as { subsystems: { system_id: string } | null } | null)?.subsystems?.system_id ?? null,
      }))}
      names={names}
      canRecord={ctx.role !== 'client'}
    />
    </>
  )
}
