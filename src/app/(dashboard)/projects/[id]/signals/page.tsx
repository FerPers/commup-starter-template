import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SignalsView from './SignalsView'

export default async function SignalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  const { data: signals } = await supabase
    .from('signals')
    .select(`
      id, signal_tag, description, signal_type,
      eng_unit, range_min, range_max,
      service, alarm_setpoints, origin, destination,
      pid_drawing, loop_diagram, wiring_diagram, notes,
      loop_id,
      tags!inner (
        id, tag_number,
        subsystems!inner (
          id, code, name,
          systems!inner (
            id, code, name,
            areas!inner ( id, code, name )
          )
        ),
        disciplines ( id, code, name, color )
      )
    `)
    .eq('tags.project_id', id)
    .order('signal_tag')

  const { data: subsystems } = await supabase
    .from('subsystems')
    .select('id, code, name, systems!inner(project_id)')
    .eq('systems.project_id', id)
    .order('code')

  return (
    <SignalsView
      projectId={project.id}
      projectName={project.name}
      signals={signals ?? []}
      subsystems={subsystems ?? []}
    />
  )
}
