import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ItrListView from './ItrListView'

export default async function ProjectItrsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [{ data: project }, { data: itrs }, { data: phases }, { data: members }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('itrs')
      .select(`
        id, itr_number, status, progress_pct, scheduled_date, created_at,
        itr_templates(code, title, disciplines(code, name, color)),
        tags(id, tag_number, description),
        project_phases(code, name, color),
        itr_assignments(user_id, role, profiles(full_name)),
        itr_signatures(role, signed_at)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('project_id', projectId)
      .order('order_index'),
    supabase
      .from('org_members')
      .select('user_id, profiles(full_name)')
      .eq('org_id', membership.org_id),
  ])

  if (!project) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (members ?? []).map(m => ({ user_id: m.user_id, full_name: (m as any).profiles?.full_name as string ?? '' })).filter(u => u.full_name)

  return (
    <ItrListView
      projectId={projectId}
      projectName={project.name}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itrs={(itrs ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phases={(phases ?? []) as any}
      users={users}
      userRole={membership.role}
    />
  )
}
