import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PunchListView from './PunchListView'

export default async function PunchListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

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

  const [
    { data: project },
    { data: punches },
    { data: phases },
    { data: disciplines },
    { data: systems },
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
        target_date, closed_date, created_at, itr_id,
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
      .eq('project_id', projectId)
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
  ])

  if (!project) notFound()

  return (
    <PunchListView
      projectId={projectId}
      projectName={project.name}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      punches={(punches ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phases={(phases ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disciplines={(disciplines ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      systems={(systems ?? []) as any}
    />
  )
}
