import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import KpiGlobal from './KpiGlobal'
import { fetchItrPhaseCounts, fetchPunchCounts, fetchCertCounts, sumItr, sumPunch, sumCert, isOpenPunch } from '@/lib/list/kpi-query'

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

  // Sprint E: agregados SQL por proyecto (una llamada por tabla, sin traer filas)
  const scope = { orgId: ctx.orgId }
  const [itrCounts, punchCounts, certCounts] = await Promise.all([
    fetchItrPhaseCounts(supabase, scope),
    fetchPunchCounts(supabase, scope),
    fetchCertCounts(supabase, scope),
  ])

  const projectKpis = (projects ?? []).map(p => {
    const totalItrs      = sumItr(itrCounts, i => i.project_id === p.id)
    const approvedItrs   = sumItr(itrCounts, i => i.project_id === p.id && i.status === 'approved')
    const inProgressItrs = sumItr(itrCounts, i => i.project_id === p.id && i.status === 'in_progress')
    const completionPct  = totalItrs > 0 ? Math.round((approvedItrs / totalItrs) * 100) : 0

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
      openCatA: sumPunch(punchCounts, x => x.project_id === p.id && isOpenPunch(x) && x.category === 'A'),
      openCatB: sumPunch(punchCounts, x => x.project_id === p.id && isOpenPunch(x) && x.category === 'B'),
      issuedCerts: sumCert(certCounts, c => c.project_id === p.id && c.status === 'issued'),
      totalCerts: sumCert(certCounts, c => c.project_id === p.id),
    }
  })

  return <KpiGlobal projectKpis={projectKpis} />
}
