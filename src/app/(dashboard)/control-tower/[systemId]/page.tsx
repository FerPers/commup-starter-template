import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { SystemGate } from '@/lib/readiness/gates'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import SystemGatesView from './SystemGatesView'

// Detalle de gates de un sistema (fase 1 plan readiness): criterios con su evidencia,
// bloqueos con enlace y aprobación formal del hold point.
export default async function SystemGatesPage({
  params,
}: {
  params: Promise<{ systemId: string }>
}) {
  const { systemId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: system } = await supabase
    .from('systems')
    .select('id, code, name, project_id, areas(code, name), projects(id, code, name, org_id)')
    .eq('id', systemId)
    .single()

  const project = system?.projects as { id: string; code: string; name: string; org_id: string } | null | undefined
  if (!system || !project || project.org_id !== ctx.orgId) notFound()
  const area = system.areas as { code: string; name: string } | null

  const [{ data: gates, error: gatesError }, { data: phases }, { data: members }, { data: deps }] = await Promise.all([
    supabase.rpc('compute_system_gates', { p_system_id: systemId }),
    supabase.from('project_phases').select('id, code').eq('org_id', ctx.orgId),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    supabase.from('system_dependencies')
      .select(`system_id, depends_on_system_id,
        provider:systems!system_dependencies_depends_on_system_id_fkey(id, code),
        dependent:systems!system_dependencies_system_id_fkey(id, code)`)
      .eq('project_id', system.project_id)
      .or(`system_id.eq.${systemId},depends_on_system_id.eq.${systemId}`),
  ])
  type Ref = { id: string; code: string }
  const dependsOn = (deps ?? []).filter(d => d.system_id === systemId).map(d => d.provider as unknown as Ref).filter(Boolean)
  const enables = (deps ?? []).filter(d => d.depends_on_system_id === systemId).map(d => d.dependent as unknown as Ref).filter(Boolean)
  if (gatesError) console.error('[SystemGates] rpc error:', gatesError)

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const phaseCodes: Record<string, string> = {}
  for (const ph of phases ?? []) phaseCodes[ph.id] = ph.code

  return (
    <SystemGatesView
      orgId={ctx.orgId}
      role={ctx.role}
      userId={ctx.userId}
      canEdit={EDITOR_ROLES.includes(ctx.role)}
      project={{ id: project.id, code: project.code, name: project.name }}
      system={{ id: system.id, code: system.code, name: system.name, area: area ? `${area.code} — ${area.name}` : '' }}
      gates={(gates ?? []) as unknown as SystemGate[]}
      names={names}
      phaseCodes={phaseCodes}
      dependsOn={dependsOn}
      enables={enables}
    />
  )
}
