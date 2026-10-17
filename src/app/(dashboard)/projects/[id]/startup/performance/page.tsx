import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { PerfRunStatus, RevisionStatus } from '@/lib/performance/catalog'
import PerformanceView from './PerformanceView'

// Pruebas de desempeño del proyecto (fase 7 plan readiness, sesión 1): lista con revisión vigente y último intento.
export default async function PerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: tests }, { data: systems }] = await Promise.all([
    supabase.from('performance_tests')
      .select('id, number, title, current_revision_id, systems(code, name), performance_test_revisions!performance_test_revisions_test_id_fkey(id, rev, status), performance_runs(id, attempt, number, status, closed_at, aborted_at, created_at)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
  ])

  type Rev = { id: string; rev: number; status: RevisionStatus }
  type Run = { id: string; attempt: number; number: string; status: PerfRunStatus }
  return (
    <PerformanceView
      project={project}
      systems={systems ?? []}
      tests={(tests ?? []).map(x => {
        const revs = (x.performance_test_revisions ?? []) as Rev[]
        const runs = ((x.performance_runs ?? []) as Run[]).sort((a, b) => b.attempt - a.attempt)
        const sys = x.systems as unknown as { code: string; name: string } | null
        return {
          id: x.id, number: x.number, title: x.title, system: sys ? `${sys.code} — ${sys.name}` : '—',
          currentRev: revs.find(r => r.id === x.current_revision_id)?.rev ?? null,
          openRev: revs.find(r => r.status === 'draft' || r.status === 'in_review') ?? null,
          lastRun: runs[0] ?? null,
        }
      })}
      canLead={['owner', 'admin', 'architect', 'leader'].includes(ctx.role)}
    />
  )
}
