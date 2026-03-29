import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ImportSignalsWizard from './ImportSignalsWizard'

export default async function ImportSignalsPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!['owner', 'admin', 'architect'].includes(membership.role)) redirect(`/projects/${id}`)

  const [{ data: project }, { data: disciplines }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('org_id', membership.org_id).single(),
    supabase.from('disciplines').select('id, code, name, color').eq('org_id', membership.org_id),
  ])

  if (!project) notFound()

  return (
    <ImportSignalsWizard
      projectId={project.id}
      projectName={project.name}
      disciplines={disciplines ?? []}
    />
  )
}
