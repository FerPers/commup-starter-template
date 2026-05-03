import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import SignalsView from './SignalsView'

export default async function SignalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signals={(signals ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subsystems={(subsystems ?? []) as any}
    />
  )
}
