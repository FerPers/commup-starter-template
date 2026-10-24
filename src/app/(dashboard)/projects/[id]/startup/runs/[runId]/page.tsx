import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { loadMyCapacities } from '@/lib/capacities/server'
import type { HoldCapacity, RunStepStatus } from '@/lib/startup/catalog'
import RunView, { type RunTimelineEntry } from './RunView'

// Ejecución de un procedimiento en campo (fase 6, sesión 1), pensada para móvil: pasos en orden,
// hold points que solo libera otra persona con la capacidad pedida y «Detener» siempre a mano.
export default async function RunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: run } = await supabase.from('procedure_runs')
    .select('*, procedures(id, number, title, current_revision_id), procedure_revisions(rev, sections), systems(code, name)')
    .eq('id', runId).eq('project_id', id).maybeSingle()
  if (!run) notFound()
  const [{ data: steps }, { data: members }, { data: events }] = await Promise.all([
    supabase.from('procedure_run_steps')
      .select('step_id, ord, status, actual_value, comment, done_by, done_at, released_by, released_at, release_comment, out_of_range, procedure_steps(action, responsible, expected_value, expected_min, expected_max, expected_unit, is_hold_point, hold_capacity, stop_criteria, tags(tag_number))')
      .eq('run_id', runId).order('ord'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    // S25 (E-10): línea de tiempo (unas decenas de filas por ejecución).
    supabase.from('procedure_run_events').select('id, kind, step_id, user_id, field_at, recorded_at, comment').eq('run_id', runId).limit(500),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const proc = run.procedures
  // S25b (E-32): ¿la revisión que se ejecuta fue reemplazada por otra aprobada?
  const { data: currentRev } = proc.current_revision_id && proc.current_revision_id !== run.revision_id
    ? await supabase.from('procedure_revisions').select('rev, status').eq('id', proc.current_revision_id).maybeSingle()
    : { data: null }
  const rev = run.procedure_revisions as { rev: number; sections: Record<string, string> }
  const sys = run.systems

  return (
    <RunView
      project={project}
      run={{
        id: run.id, number: run.number, status: run.status, procedureId: proc.id, procedureNumber: proc.number, title: proc.title, rev: rev.rev,
        safety: rev.sections?.safety ?? null, stopCriteria: rev.sections?.stop_criteria ?? null,
        system: sys ? `${sys.code} — ${sys.name}` : null, stopReason: run.stop_reason, abortReason: run.abort_reason,
        startedBy: run.started_by, startedAt: run.started_at, completedAt: run.completed_at,
        supersededBy: currentRev?.status === 'approved' ? currentRev.rev : null,
      }}
      steps={(steps ?? []).map(s => {
        const st = s.procedure_steps
        return {
          stepId: s.step_id, ord: s.ord, status: s.status as RunStepStatus, actual: s.actual_value, comment: s.comment,
          doneBy: s.done_by, doneAt: s.done_at, releasedBy: s.released_by, releasedAt: s.released_at, releaseComment: s.release_comment,
          action: st.action, responsible: st.responsible, expected: st.expected_value, isHold: st.is_hold_point,
          capacity: (st.hold_capacity ?? 'operations') as HoldCapacity, stopCriteria: st.stop_criteria, tag: st.tags?.tag_number ?? null,
          expectedMin: st.expected_min === null ? null : Number(st.expected_min), expectedMax: st.expected_max === null ? null : Number(st.expected_max),
          expectedUnit: st.expected_unit, outOfRange: s.out_of_range,
        }
      })}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
      caps={await loadMyCapacities(ctx.supabase, id)}
      timeline={(events ?? [])
        .map(e => ({
          id: e.id, kind: e.kind as RunTimelineEntry['kind'], userId: e.user_id, at: e.field_at ?? e.recorded_at, comment: e.comment,
          stepOrd: e.step_id ? (steps ?? []).find(s => s.step_id === e.step_id)?.ord ?? null : null,
        }))
        .sort((a, b) => a.at.localeCompare(b.at))}
    />
  )
}
