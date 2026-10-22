import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import StartupView from './StartupView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// Arranque del proyecto (fase 6 plan readiness, sesión 1): biblioteca de procedimientos y hojas de line-up.
// H-18: pestañas con ruta (`/startup` = procedimientos, `/startup/lineups`); las dos leen lo mismo porque el alta de
// una hoja de line-up elige su procedimiento.
export default async function StartupLibraryPage({ projectId: id, tab }: { projectId: string; tab: 'procedures' | 'lineups' }) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  // S09 (E-20): PostgREST corta en 1000 filas; la biblioteca de procedimientos y las hojas de line-up se paginan
  // completas. «Copiar desde otro proyecto» sigue acotado a 500 a propósito (selector, no listado).
  const [procRes, sheetsRes, { data: systems }, { data: others }, runsRes] = await Promise.all([
    fetchAllRowsFlagged(() => supabase.from('procedures')
      .select('id, number, title, kind, system_id, current_revision_id, systems(code), procedure_revisions!procedure_revisions_procedure_id_fkey(id, rev, status, field_verified_at)')
      .eq('project_id', id).order('seq', { ascending: false })),
    fetchAllRowsFlagged(() => supabase.from('lineup_sheets')
      .select('id, number, title, purpose, status, verified_at, system_id, systems(code), lineup_items(id, is_critical, set_at, verified_at, found_position, required_position)')
      .eq('project_id', id).order('seq', { ascending: false })),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    // Procedimientos de otros proyectos de la org, para «Copiar desde otro proyecto».
    supabase.from('procedures').select('id, number, title, projects(code)').neq('project_id', id).order('title').limit(500),
    fetchAllRowsFlagged(() => supabase.from('procedure_runs').select('id, procedure_id, status').eq('project_id', id).in('status', ['in_progress', 'at_hold', 'stopped'])),
  ])
  const procedures = procRes.rows
  const sheets = sheetsRes.rows
  const runs = runsRes.rows

  type Rev = { id: string; rev: number; status: string; field_verified_at: string | null }
  const tl = await getTranslations('Common')
  return (
    <>
    {(procRes.truncated || sheetsRes.truncated) && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <StartupView
      project={project}
      tab={tab}
      procedures={procedures.map(p => {
        const revs = ((p.procedure_revisions ?? []) as Rev[]).sort((a, b) => b.rev - a.rev)
        const current = revs.find(r => r.id === p.current_revision_id) ?? null
        return {
          id: p.id, number: p.number, title: p.title, kind: p.kind, system: (p.systems as unknown as { code: string } | null)?.code ?? null,
          currentRev: current?.rev ?? null, fieldVerified: !!current?.field_verified_at,
          openRev: revs.find(r => r.status === 'draft' || r.status === 'in_review') ?? null,
          liveRuns: runs.filter(r => r.procedure_id === p.id).length,
        }
      })}
      sheets={sheets.map(s => ({
        id: s.id, number: s.number, title: s.title, purpose: s.purpose, status: s.status, verifiedAt: s.verified_at,
        system: (s.systems as unknown as { code: string } | null)?.code ?? null,
        items: (s.lineup_items ?? []) as { is_critical: boolean; set_at: string | null; verified_at: string | null; found_position: string | null; required_position: string | null }[],
      }))}
      systems={systems ?? []}
      otherProcedures={(others ?? []).map(o => ({ id: o.id, label: `${(o.projects as unknown as { code: string } | null)?.code ?? '?'} · ${o.number} — ${o.title}` }))}
      canEdit={ctx.role !== 'client'}
    />
    </>
  )
}
