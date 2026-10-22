import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { loadMyCapacities } from '@/lib/capacities/server'
import { chartWindow, type EventCategory, type Milestone, type StartupEventStatus } from '@/lib/startup/catalog'
import EventDetail from './EventDetail'

// Ficha de un evento de arranque (fase 6, sesión 2): parámetros congelados (IIoT o manuales), gráfico
// −30/+30 min por señal desde signal_samples_1min, testigo y anulación.
export default async function StartupEventPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: ev } = await supabase.from('startup_events')
    .select('*, systems(code, name), procedure_runs(id, number)')
    .eq('id', eventId).eq('project_id', id).maybeSingle()
  if (!ev) notFound()

  const [{ data: paramsRows }, { data: tags }, { data: members }] = await Promise.all([
    supabase.from('startup_event_params').select('id, signal_id, label, value, value_text, unit, quality, sampled_at, offset_s, source').eq('event_id', eventId).order('created_at'),
    supabase.from('startup_event_tags').select('tags(tag_number)').eq('event_id', eventId),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const signalIds = [...new Set((paramsRows ?? []).map(p => p.signal_id).filter((x): x is string => !!x))]
  const win = chartWindow(ev.occurred_at)
  // S12 (E-03): serie reducida en la BD con filtro sargable por rango (antes la vista de 1 minuto agregaba toda
  // la historia de cada señal). Hasta 50 señales; ±30 min a 1 minuto = ~60 puntos por señal.
  const { data: seriesRows, error: seriesErr } = signalIds.length
    ? await supabase.rpc('signal_series', { p_signal_ids: signalIds.slice(0, 50), p_from: win.from, p_to: win.to, p_bucket_s: 60 })
    : { data: [], error: null }
  if (seriesErr) console.error('[startup/events] signal_series', seriesErr)
  const series = seriesRows ?? []

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const sys = ev.systems as unknown as { code: string; name: string } | null
  const run = ev.procedure_runs as unknown as { id: string; number: string } | null

  return (
    <EventDetail
      project={project}
      event={{
        id: ev.id, number: ev.number, kind: ev.kind as 'milestone' | 'free', milestone: ev.milestone as Milestone | null, category: ev.category as EventCategory | null,
        occurredAt: ev.occurred_at, title: ev.title, description: ev.description, status: ev.status as StartupEventStatus,
        system: sys ? `${sys.code} — ${sys.name}` : '—', systemId: ev.system_id, run,
        recordedBy: ev.recorded_by, recordedAt: ev.recorded_at, witnessCapacity: ev.witness_capacity, witnessBy: ev.witness_by, witnessAt: ev.witness_at,
        voidedBy: ev.voided_by, voidedAt: ev.voided_at, voidReason: ev.void_reason, backdateReason: ev.backdate_reason,
        tags: (tags ?? []).map(x => (x.tags as unknown as { tag_number: string } | null)?.tag_number).filter((x): x is string => !!x),
      }}
      params={(paramsRows ?? []).map(p => ({ ...p, value: p.value === null ? null : Number(p.value) }))}
      series={(series ?? []).map(s => ({ signalId: s.signal_id as string, bucket: s.bucket as string, value: s.avg_val === null ? null : Number(s.avg_val) }))}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
      caps={await loadMyCapacities(ctx.supabase, id)}
    />
  )
}
