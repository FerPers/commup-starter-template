import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import type { DependencyKind, SystemType } from '@/lib/systems/dependencies'
import SystemsView, { type SystemListItem, type DependencyEdge } from './SystemsView'

// Sistematización del proyecto (fase 2 plan readiness): sistemas con tipo, prioridad,
// límites y dependencias; lista + matriz + importación Excel.
export default async function SystemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()
  if (!project) notFound()

  const [{ data: systems }, { data: deps }, { data: gates }] = await Promise.all([
    supabase
      .from('systems')
      .select('id, code, name, system_type, priority, boundary_frozen_at, areas(code, name), subsystems(count)')
      .eq('project_id', id)
      .order('code'),
    supabase
      .from('system_dependencies')
      .select('id, system_id, depends_on_system_id, kind, required_gate_id, blocked_gate_id')
      .eq('project_id', id),
    supabase.from('readiness_gates').select('id, code').eq('org_id', ctx.orgId),
  ])

  const list: SystemListItem[] = (systems ?? []).map(s => {
    const area = s.areas as { code: string; name: string } | null
    const sub = s.subsystems as unknown as { count: number }[] | null
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      area: area ? area.code : '',
      areaName: area?.name ?? '',
      system_type: (s.system_type as SystemType | null) ?? null,
      priority: s.priority,
      frozen: !!s.boundary_frozen_at,
      subsystems: sub?.[0]?.count ?? 0,
    }
  })
  const gateCode = Object.fromEntries((gates ?? []).map(g => [g.id, g.code]))
  const edges: DependencyEdge[] = (deps ?? []).map(d => ({
    id: d.id,
    system_id: d.system_id,
    depends_on_system_id: d.depends_on_system_id,
    kind: d.kind as DependencyKind,
    required: gateCode[d.required_gate_id] ?? '?',
    blocked: gateCode[d.blocked_gate_id] ?? '?',
  }))

  return (
    <SystemsView
      project={project}
      systems={list}
      edges={edges}
      canEdit={EDITOR_ROLES.includes(ctx.role)}
    />
  )
}
