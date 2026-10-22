import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import WorkPlansGlobal from './WorkPlansGlobal'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import { ROLE_TIERS } from '@/lib/constants/roles'


// N2c: «Todos los proyectos» de la lista del proyecto (`?scope=all`); antes era la página global.
export default async function AllWorkPlans() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const member = { org_id: ctx.orgId, role: ctx.role }

  const orgId = member.org_id
  const canEdit = ROLE_TIERS.editor.includes(member.role)

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

  // Fetch work plans with items count + leader info. S09 (B-07): PostgREST corta en 1000 filas → se pagina.
  const projectIds = (projects ?? []).map(p => p.id)
  const { rows: rawPlans, truncated } = projectIds.length === 0
    ? { rows: [], truncated: false }
    : await fetchAllRowsFlagged(() => supabase
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
    .in('project_id', projectIds)
    .order('plan_date', { ascending: false }))

  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <WorkPlansGlobal
      projects={projects ?? []}
      disciplines={disciplines ?? []}
      orgMembers={members ?? []}
      workPlans={rawPlans}
      canEdit={canEdit}
      currentUserId={ctx.userId}
    />
    </>
  )
}
