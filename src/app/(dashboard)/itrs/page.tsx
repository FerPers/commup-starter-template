import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import ItrListGlobal from './ItrListGlobal'

export default async function GlobalItrsPage() {
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

  const [{ data: itrs }, { data: phases }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('itrs')
          .select(`
            id, itr_number, status, progress_pct, scheduled_date, created_at, project_id,
            projects(id, name, code),
            itr_templates(code, title, disciplines(code, name, color)),
            tags(id, tag_number, description),
            project_phases(code, name, color),
            itr_assignments(user_id, role, profiles(full_name)),
            itr_signatures(role, signed_at)
          `)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  return (
    <ItrListGlobal
      projects={projects ?? []}
      itrs={itrs ?? []}
      phases={phases ?? []}
    />
  )
}
