import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import LoopsView from './LoopsView'

export default async function LoopsPage({ params }: { params: Promise<{ id: string }> }) {
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
      loops={loops ?? []}
    />
  )
}
