import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PunchListView from './PunchListView'

export default async function PunchListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [
    { data: project },
    { data: punches },
    { data: phases },
    { data: disciplines },
    { data: systems },
    { data: orgMembers },
    { data: tags },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('punches')
      .select(`
        id, punch_number, category, description, status, priority,
        target_date, closed_date, created_at, itr_id, assigned_to,
        raised_by_profile:profiles!raised_by(full_name),
        assigned_to_profile:profiles!assigned_to(full_name),
        tags(id, tag_number, description, disciplines(code, name, color)),
        subsystems(id, code, name, systems(code, name))
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('order_index'),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
    supabase
      .from('systems')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('code'),
    supabase
      .from('org_members')
      .select('user_id, profiles(full_name)')
      .eq('org_id', membership.org_id)
      .order('role'),
    supabase
      .from('tags')
      .select('id, tag_number, description, disciplines(code, name, color)')
      .eq('project_id', projectId)
      .order('tag_number'),
  ])

  if (!project) notFound()

  return (
    <PunchListView
      projectId={projectId}
      projectName={project.name}
      currentUserRole={membership.role}
      punches={punches ?? []}
      phases={phases ?? []}
      disciplines={disciplines ?? []}
      systems={systems ?? []}
      orgMembers={orgMembers ?? []}
      tags={tags ?? []}
    />
  )
}
