import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { HoldCapacity } from '@/lib/startup/catalog'
import ProcedureEditor from './ProcedureEditor'

// Procedimiento (fase 6, sesión 1): revisión abierta (o la vigente) con sus 15 secciones y pasos;
// ciclo borrador → en revisión → aprobado, «verificado en campo», nuevas revisiones y ejecuciones.
export default async function ProcedurePage({ params, searchParams }: {
  params: Promise<{ id: string; procedureId: string }>
  searchParams: Promise<{ rev?: string }>
}) {
  const { id, procedureId } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: proc } = await supabase.from('procedures').select('*').eq('id', procedureId).eq('project_id', id).maybeSingle()
  if (!proc) notFound()

  const [{ data: revisions }, { data: runs }, { data: systems }, { data: members }] = await Promise.all([
    supabase.from('procedure_revisions').select('*').eq('procedure_id', procedureId).order('rev', { ascending: false }),
    supabase.from('procedure_runs').select('id, number, status, started_at, completed_at, system_id, systems(code)').eq('procedure_id', procedureId).order('seq', { ascending: false }),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const revs = revisions ?? []
  const selected = revs.find(r => r.id === sp.rev)
    ?? revs.find(r => r.status === 'draft' || r.status === 'in_review')
    ?? revs.find(r => r.id === proc.current_revision_id)
    ?? revs[0]
  if (!selected) notFound()
  const { data: steps } = await supabase.from('procedure_steps')
    .select('id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria, tags(tag_number)')
    .eq('revision_id', selected.id).order('ord')
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  return (
    <ProcedureEditor
      project={project}
      procedure={{ id: proc.id, number: proc.number, title: proc.title, kind: proc.kind, systemId: proc.system_id, currentRevisionId: proc.current_revision_id }}
      revisions={revs.map(r => ({ id: r.id, rev: r.rev, status: r.status }))}
      revision={{
        id: selected.id, rev: selected.rev, status: selected.status, sections: (selected.sections ?? {}) as Record<string, string>,
        changeReason: selected.change_reason, returnedReason: selected.returned_reason, createdBy: selected.created_by,
        submittedBy: selected.submitted_by, approvedBy: selected.approved_by, approvedAt: selected.approved_at,
        fieldVerifiedBy: selected.field_verified_by, fieldVerifiedAt: selected.field_verified_at, walkdownNote: selected.walkdown_note, hash: selected.content_hash,
      }}
      steps={(steps ?? []).map(s => ({
        action: s.action, responsible: s.responsible ?? '', expected_value: s.expected_value ?? '', tag_id: s.tag_id,
        tag_number: (s.tags as unknown as { tag_number: string } | null)?.tag_number ?? null,
        is_hold_point: s.is_hold_point, hold_capacity: (s.hold_capacity ?? 'operations') as HoldCapacity, stop_criteria: s.stop_criteria ?? '',
      }))}
      runs={(runs ?? []).map(r => ({ id: r.id, number: r.number, status: r.status, startedAt: r.started_at, completedAt: r.completed_at, system: (r.systems as unknown as { code: string } | null)?.code ?? null }))}
      systems={systems ?? []}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
    />
  )
}
