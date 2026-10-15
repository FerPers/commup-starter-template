import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isEditor } from '@/lib/auth/permissions'
import { isAiConfigured } from '@/lib/ai/claude'
import ImportCeWizard from './ImportCeWizard'

// Importar una matriz C&E con IA (fase 4-D, sesión 3): la IA propone, una persona revisa y acepta.
export default async function ImportCeMatrixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!isEditor(ctx.role)) redirect(`/projects/${id}/ce-matrices`)
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: systems } = await supabase.from('systems').select('id, code, name').eq('project_id', id).order('code').limit(1000)

  return <ImportCeWizard project={project} systems={systems ?? []} aiReady={isAiConfigured()} />
}
