import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import LoopsView from './LoopsView'

export default async function LoopsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: loops } = await supabase
    .from('loops')
    .select(`
      id, loop_number, description, status,
      disciplines ( id, code, name, color ),
      subsystems (
        id, code, name,
        systems!inner (
          id, code, name,
          areas!inner ( id, code, name )
        )
      ),
      loop_tags ( id, role_in_loop, tags ( id, tag_number ) )
    `)
    .eq('project_id', id)
    .order('loop_number')

  return (
    <LoopsView
      projectId={project.id}
      projectName={project.name}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loops={(loops ?? []) as any}
    />
  )
}
