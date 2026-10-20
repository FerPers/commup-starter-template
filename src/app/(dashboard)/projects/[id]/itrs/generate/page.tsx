import { notFound, redirect } from 'next/navigation'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import GenerateItrsView from './GenerateItrsView'

// S19 (C-14): generar ITR por alcance × fase desde la matriz aprobada (solo líderes o superiores).
export default async function GenerateItrsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!ROLE_TIERS.editor.includes(ctx.role)) redirect(`/projects/${projectId}/itrs`)
  const supabase = ctx.supabase

  const [{ data: project }, { data: phases }, { data: systems }, { data: subsystems }, { data: members }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).eq('org_id', ctx.orgId).maybeSingle(),
    supabase.from('project_phases').select('id, code, name, color').eq('org_id', ctx.orgId).order('order_index'),
    // bounded: sistemas de un proyecto
    supabase.from('systems').select('id, code, name').eq('project_id', projectId).order('code'),
    // bounded: subsistemas de un proyecto
    supabase.from('subsystems').select('id, code, name, system_id').eq('project_id', projectId).order('code'),
    supabase.from('org_members').select('user_id, role, profiles(full_name)').eq('org_id', ctx.orgId).eq('status', 'active'),
  ])
  if (!project) notFound()

  return (
    <GenerateItrsView
      projectId={projectId}
      projectName={project.name}
      phases={phases ?? []}
      systems={systems ?? []}
      subsystems={subsystems ?? []}
      members={(members ?? []).map(m => ({ user_id: m.user_id, role: m.role, full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? '' }))
        .filter(m => m.full_name).sort((a, b) => a.full_name.localeCompare(b.full_name))}
    />
  )
}
