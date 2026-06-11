import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import InterlocksView from './InterlocksView'

export default async function InterlocksPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: interlocks } = await supabase
    .from('interlocks')
    .select(`
      id, interlock_number, description, set_point, action,
      subsystems (
        id, code, name,
        systems!inner (
          id, code, name,
          areas!inner ( id, code, name )
        )
      ),
      cause_tag:tags!interlocks_cause_tag_id_fkey ( id, tag_number ),
      effect_tag:tags!interlocks_effect_tag_id_fkey ( id, tag_number )
    `)
    .eq('project_id', id)
    .order('interlock_number')

  return (
    <InterlocksView
      projectId={project.id}
      projectName={project.name}
      interlocks={interlocks ?? []}
    />
  )
}
