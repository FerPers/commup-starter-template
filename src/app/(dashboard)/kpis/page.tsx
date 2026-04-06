import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KpiGlobal from './KpiGlobal'

export default async function GlobalKpiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const [{ data: projects }, { data: itrs }, { data: punches }, { data: certificates }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, status, start_date, end_date')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('itrs')
      .select('id, status, project_id'),
    supabase
      .from('punches')
      .select('id, category, status, project_id')
      .not('status', 'in', '(closed,cancelled)'),
    supabase
      .from('certificates')
      .select('id, status, project_id'),
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
