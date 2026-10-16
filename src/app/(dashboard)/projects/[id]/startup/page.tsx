import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import StartupView from './StartupView'

// Arranque del proyecto (fase 6 plan readiness, sesión 1): biblioteca de procedimientos y hojas de line-up.
export default async function StartupPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: procedures }, { data: sheets }, { data: systems }, { data: others }, { data: runs }] = await Promise.all([
    supabase.from('procedures')
      .select('id, number, title, kind, system_id, current_revision_id, systems(code), procedure_revisions!procedure_revisions_procedure_id_fkey(id, rev, status, field_verified_at)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('lineup_sheets')
      .select('id, number, title, purpose, status, verified_at, system_id, systems(code), lineup_items(id, is_critical, set_at, verified_at, found_position, required_position)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    // Procedimientos de otros proyectos de la org, para «Copiar desde otro proyecto».
    supabase.from('procedures').select('id, number, title, projects(code)').neq('project_id', id).order('title').limit(500),
    supabase.from('procedure_runs').select('id, procedure_id, status').eq('project_id', id).in('status', ['in_progress', 'at_hold', 'stopped']),
  ])

  type Rev = { id: string; rev: number; status: string; field_verified_at: string | null }
  return (
    <StartupView
      project={project}
      initialTab={tab === 'lineups' ? 'lineups' : 'procedures'}
      procedures={(procedures ?? []).map(p => {
        const revs = ((p.procedure_revisions ?? []) as Rev[]).sort((a, b) => b.rev - a.rev)
        const current = revs.find(r => r.id === p.current_revision_id) ?? null
        return {
          id: p.id, number: p.number, title: p.title, kind: p.kind, system: (p.systems as unknown as { code: string } | null)?.code ?? null,
          currentRev: current?.rev ?? null, fieldVerified: !!current?.field_verified_at,
          openRev: revs.find(r => r.status === 'draft' || r.status === 'in_review') ?? null,
          liveRuns: (runs ?? []).filter(r => r.procedure_id === p.id).length,
        }
      })}
      sheets={(sheets ?? []).map(s => ({
        id: s.id, number: s.number, title: s.title, purpose: s.purpose, status: s.status, verifiedAt: s.verified_at,
        system: (s.systems as unknown as { code: string } | null)?.code ?? null,
        items: (s.lineup_items ?? []) as { is_critical: boolean; set_at: string | null; verified_at: string | null; found_position: string | null; required_position: string | null }[],
      }))}
      systems={systems ?? []}
      otherProcedures={(others ?? []).map(o => ({ id: o.id, label: `${(o.projects as unknown as { code: string } | null)?.code ?? '?'} · ${o.number} — ${o.title}` }))}
      canEdit={ctx.role !== 'client'}
    />
  )
}
