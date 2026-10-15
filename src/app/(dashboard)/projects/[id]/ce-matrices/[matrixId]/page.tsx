import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isEditor } from '@/lib/auth/permissions'
import type { CeAction, CeCause, CeEffect, CeLink, CeVoting } from '@/lib/ce/matrix'
import { loadGenerationTemplates, loadMembers, loadSourceItrs } from '@/lib/itr/source-itrs-server'
import CeMatrixEditor from './CeMatrixEditor'

// Una matriz C&E: causas (filas) × efectos (columnas) y sus cruces (fase 4-D, sesión 1).
export default async function CeMatrixPage({ params }: { params: Promise<{ id: string; matrixId: string }> }) {
  const { id, matrixId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: matrix } = await supabase
    .from('ce_matrices')
    .select('id, code, title, revision, source_document, notes, system_id, projects!inner(id, name, org_id), systems(code, name)')
    .eq('id', matrixId)
    .eq('project_id', id)
    .eq('projects.org_id', ctx.orgId)
    .maybeSingle()
  if (!matrix) notFound()

  const [{ data: causes }, { data: effects }, { data: links }, { data: tags }] = await Promise.all([
    supabase.from('ce_causes').select('id, seq, code, description, condition, setpoint, voting, notes, tags(tag_number), signals(signal_tag)').eq('matrix_id', matrixId).order('seq').order('code'),
    supabase.from('ce_effects').select('id, seq, code, description, action, notes, tags(tag_number)').eq('matrix_id', matrixId).order('seq').order('code'),
    supabase.from('ce_links').select('cause_id, effect_id, link_type, delay_s, ce_causes!inner(matrix_id)').eq('ce_causes.matrix_id', matrixId),
    // Sugerencias de tags: los del sistema de la matriz, o los del proyecto si no tiene sistema.
    matrix.system_id
      ? supabase.from('tags').select('tag_number, subsystems!inner(system_id)').eq('project_id', id).eq('subsystems.system_id', matrix.system_id).order('tag_number').limit(1000)
      : supabase.from('tags').select('tag_number').eq('project_id', id).order('tag_number').limit(1000),
  ])

  const causeRows: CeCause[] = (causes ?? []).map(c => ({
    id: c.id, seq: c.seq, code: c.code, description: c.description, condition: c.condition, setpoint: c.setpoint,
    voting: c.voting as CeVoting | null, notes: c.notes, tag_number: c.tags?.tag_number ?? null, signal_tag: c.signals?.signal_tag ?? null,
  }))
  const effectRows: CeEffect[] = (effects ?? []).map(e => ({
    id: e.id, seq: e.seq, code: e.code, description: e.description, action: e.action as CeAction, notes: e.notes, tag_number: e.tags?.tag_number ?? null,
  }))

  // Fase 4-D: ITR de prueba vigente por causa (estado, desactualizado, resultado por efecto) y generación.
  const canEdit = isEditor(ctx.role)
  const [causeItrs, templates, members] = await Promise.all([
    loadSourceItrs(supabase, 'cause', causeRows.map(c => c.id)),
    canEdit ? loadGenerationTemplates(supabase, ctx.orgId, 'ce_effects') : Promise.resolve([]),
    canEdit ? loadMembers(supabase, ctx.orgId) : Promise.resolve([]),
  ])

  return (
    <CeMatrixEditor
      causeItrs={causeItrs}
      templates={templates}
      members={members}
      projectId={id}
      projectName={matrix.projects.name}
      matrix={{ id: matrix.id, code: matrix.code, title: matrix.title, revision: matrix.revision, sourceDocument: matrix.source_document, system: matrix.systems ? `${matrix.systems.code} · ${matrix.systems.name}` : null }}
      causes={causeRows}
      effects={effectRows}
      links={(links ?? []).map(l => ({ cause_id: l.cause_id, effect_id: l.effect_id, link_type: l.link_type as CeLink['link_type'], delay_s: l.delay_s }))}
      tagNumbers={(tags ?? []).map(t => t.tag_number)}
      canEdit={canEdit}
    />
  )
}
