import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PreservationGlobal from './PreservationGlobal'

export default async function GlobalPreservationPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('org_id', membership.org_id)
    .order('name')

  const projectIds = (projects ?? []).map(p => p.id)

  const { data: plans } = projectIds.length === 0
    ? { data: [] }
    : await supabase
        .from('preservation_plans')
        .select(`
          id, status, start_date, next_due_date, last_performed_date, project_id,
          projects(id, name, code),
          tags(id, tag_number, description),
          preservation_procedures(id, code, title, frequency, interval_days)
        `)
        .in('project_id', projectIds)
        .order('next_due_date', { ascending: true })

  return (
    <PreservationGlobal
      projects={projects ?? []}
      plans={plans ?? []}
    />
  )
}
