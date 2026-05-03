import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PunchListGlobal from './PunchListGlobal'

export default async function GlobalPunchListPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [{ data: projects }, { data: punches }, { data: disciplines }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('punches')
      .select(`
        id, punch_number, category, description, status, priority,
        target_date, closed_date, created_at, itr_id, project_id,
        raised_by_profile:profiles!raised_by(full_name),
        assigned_to_profile:profiles!assigned_to(full_name),
        projects(id, name, code),
        tags(id, tag_number, description, disciplines(code, name, color)),
        subsystems(id, code, name, systems(code, name))
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
  ])

  return (
    <PunchListGlobal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      punches={(punches ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disciplines={(disciplines ?? []) as any}
    />
  )
}
