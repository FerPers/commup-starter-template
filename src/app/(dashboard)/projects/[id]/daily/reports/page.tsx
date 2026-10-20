import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import ReportsListView from './ReportsListView'

// Reportes diarios del proyecto (fase 5 plan readiness, sesión 3): lista por fecha y alta del borrador.
export default async function DailyReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: reports }, { data: areas }, { data: members }] = await Promise.all([
    supabase.from('daily_reports')
      .select('id, number, report_date, revision, status, issued_at, issued_by, created_by, updated_at, summary, areas(code)')
      .eq('project_id', id).order('report_date', { ascending: false }).order('revision', { ascending: false }).limit(400),
    supabase.from('areas').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  return (
    <ReportsListView
      project={project}
      reports={(reports ?? []).map(r => ({
        id: r.id, number: r.number, date: r.report_date, revision: r.revision, status: r.status as 'draft' | 'issued' | 'superseded',
        issuedAt: r.issued_at, issuedBy: r.issued_by ? names[r.issued_by] ?? null : null, updatedAt: r.updated_at,
        area: (r.areas as unknown as { code: string } | null)?.code ?? null, hasSummary: !!r.summary,
      }))}
      areas={areas ?? []}
      canCreate={ctx.role !== 'client'}
    />
  )
}
