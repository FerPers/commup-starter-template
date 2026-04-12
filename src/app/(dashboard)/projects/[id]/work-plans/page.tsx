import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WorkPlansView from './WorkPlansView'

export default async function ProjectWorkPlansPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify membership and get role
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/login')

  // Fetch project (verify it belongs to user's org)
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()
  if (!project) redirect('/projects')

  // Parallel fetches
  const [discRes, membersRes, plansRes] = await Promise.all([
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
    supabase
      .from('org_members')
      .select('user_id, role, profiles(full_name)')
      .eq('org_id', membership.org_id),
    supabase
      .from('work_plans')
      .select(`
        id, plan_date, status, notes, project_id,
        disciplines(id, code, name, color),
        leader:profiles!work_plans_leader_id_fkey(full_name),
        work_plan_items(
          id, status, remarks,
          itrs(
            id, itr_number, status, progress_pct,
            tags(id, tag_number, description),
            itr_templates(code, title)
          ),
          assigned:profiles!work_plan_items_assigned_to_fkey(full_name)
        )
      `)
      .eq('project_id', projectId)
      .order('plan_date', { ascending: false }),
  ])

  const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

  return (
    <WorkPlansView
      projectId={projectId}
      projectName={project.name}
      projectCode={project.code}
      disciplines={discRes.data ?? []}
      orgMembers={(membersRes.data ?? []) as any}
      workPlans={(plansRes.data ?? []) as any}
      canEdit={EDITOR_ROLES.includes(membership.role)}
      currentUserId={user.id}
    />
  )
}
