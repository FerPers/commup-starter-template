import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WorkPlansGlobal from './WorkPlansGlobal'

export default async function WorkPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/login')

  const orgId = member.org_id
  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(member.role)

  // Fetch all projects for this org
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code, status')
    .eq('org_id', orgId)
    .order('name')

  // Fetch all disciplines for this org
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, code, name, color')
    .eq('org_id', orgId)
    .order('code')

  // Fetch org members for leader / assigned_to selectors
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, role, profiles(full_name)')
    .eq('org_id', orgId)
    .order('role')

  // Fetch work plans with items count + leader info
  const { data: rawPlans } = await supabase
    .from('work_plans')
    .select(`
      id, plan_date, status, notes,
      project_id,
      projects(id, name, code),
      disciplines(id, code, name, color),
      leader:profiles!work_plans_leader_id_fkey(full_name),
      work_plan_items(
        id, status, remarks,
        itrs(id, itr_number, status, progress_pct,
          tags(id, tag_number, description),
          itr_templates(code, title)
        ),
        assigned:profiles!work_plan_items_assigned_to_fkey(full_name)
      )
    `)
    .in('project_id', (projects ?? []).map(p => p.id))
    .order('plan_date', { ascending: false })

  return (
    <WorkPlansGlobal
      projects={(projects ?? []) as any}
      disciplines={(disciplines ?? []) as any}
      orgMembers={(members ?? []) as any}
      workPlans={(rawPlans ?? []) as any}
      canEdit={canEdit}
      currentUserId={user.id}
    />
  )
}
