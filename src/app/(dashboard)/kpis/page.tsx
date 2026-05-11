import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import KpiGlobal from './KpiGlobal'

export default async function GlobalKpiPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code, status, start_date, end_date')
    .eq('org_id', membership.org_id)
    .order('name')

  const projectIds = (projects ?? []).map(p => p.id)

  const [{ data: itrs }, { data: punches }, { data: certificates }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; status: string; project_id: string }> })
      : supabase
          .from('itrs')
          .select('id, status, project_id')
          .in('project_id', projectIds),
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; category: string; status: string; project_id: string }> })
      : supabase
          .from('punches')
          .select('id, category, status, project_id')
          .in('project_id', projectIds)
          .not('status', 'in', '(closed,cancelled)'),
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; status: string; project_id: string }> })
      : supabase
          .from('certificates')
          .select('id, status, project_id')
          .in('project_id', projectIds),
  ])

  // Build per-project KPI summary server-side
  const projectKpis = (projects ?? []).map(p => {
    const pItrs    = (itrs ?? []).filter(i => i.project_id === p.id)
    const pPunches = (punches ?? []).filter(i => i.project_id === p.id)
    const pCerts   = (certificates ?? []).filter(c => c.project_id === p.id)

    const totalItrs    = pItrs.length
    const approvedItrs = pItrs.filter(i => i.status === 'approved').length
    const inProgressItrs = pItrs.filter(i => i.status === 'in_progress').length
    const completionPct = totalItrs > 0 ? Math.round((approvedItrs / totalItrs) * 100) : 0

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      status: p.status,
      start_date: p.start_date,
      end_date: p.end_date,
      totalItrs,
      approvedItrs,
      inProgressItrs,
      completionPct,
      openCatA: pPunches.filter(p => p.category === 'A').length,
      openCatB: pPunches.filter(p => p.category === 'B').length,
      issuedCerts: pCerts.filter(c => c.status === 'issued').length,
      totalCerts: pCerts.length,
    }
  })

  return <KpiGlobal projectKpis={projectKpis as any} /> // eslint-disable-line @typescript-eslint/no-explicit-any
}
