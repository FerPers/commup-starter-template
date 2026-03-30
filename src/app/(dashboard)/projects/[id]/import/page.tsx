import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ImportWizard from './ImportWizard'

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ discipline?: string }>
}) {
  const { id }         = await params
  const { discipline } = await searchParams

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
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id),
  ])

  if (!project) notFound()

  // If a discipline code was passed in the URL, find it in the org's disciplines
  const disciplinePrefill = discipline
    ? (disciplines ?? []).find(d => d.code.toUpperCase() === discipline.toUpperCase())
    : undefined

  return (
    <ImportWizard
      projectId={project.id}
      projectName={project.name}
      disciplines={disciplines ?? []}
      disciplinePrefill={disciplinePrefill}
    />
  )
}
