import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isEditor } from '@/lib/auth/permissions'
import { matrixGaps } from '@/lib/ce/matrix'
import CeMatricesView, { type MatrixRow } from './CeMatricesView'

// Matrices causa-efecto del proyecto (fase 4 · bloque D, §10.17–10.20 del plan readiness).
// Reemplazan a la vieja lista de interlocks: cada cruce se probará como ITR por causa (sesión 2).
export default async function CeMatricesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: matrices }, { data: systems }] = await Promise.all([
    supabase
      .from('ce_matrices')
      .select('id, code, title, revision, source_document, source, updated_at, systems(code, name), ce_causes(id, ce_links(effect_id)), ce_effects(id)')
      .eq('project_id', id)
      .order('code'),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code').limit(1000),
  ])

  const rows: MatrixRow[] = (matrices ?? []).map(m => {
    const causes = m.ce_causes ?? []
    const effects = m.ce_effects ?? []
    const links = causes.flatMap(c => (c.ce_links ?? []).map(l => ({ cause_id: c.id, effect_id: l.effect_id })))
    const gaps = matrixGaps(causes, effects, links)
    return {
      id: m.id, code: m.code, title: m.title, revision: m.revision, sourceDocument: m.source_document, source: m.source,
      system: m.systems ? `${m.systems.code} · ${m.systems.name}` : null,
      causes: causes.length, effects: effects.length, links: links.length,
      gaps: gaps.causesWithoutEffect.length + gaps.effectsWithoutCause.length,
    }
  })

  return <CeMatricesView project={project} matrices={rows} systems={systems ?? []} canEdit={isEditor(ctx.role)} />
}
