import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ImportSignalsWizard from './ImportSignalsWizard'

export default async function ImportSignalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
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
