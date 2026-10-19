import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import type { BatteryLimits, DependencyKind, SystemType } from '@/lib/systems/dependencies'
import SystemDetailView, { type DependencyRow, type BoundaryEvent } from './SystemDetailView'

// Ficha de sistema (fase 2 plan readiness): atributos, límites de batería, congelamiento
// informativo y dependencias (de qué depende / a quién habilita).
export default async function SystemDetailPage({ params }: { params: Promise<{ id: string; systemId: string }> }) {
  const { id, systemId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: system } = await supabase
    .from('systems')
    .select('id, code, name, project_id, system_type, priority, battery_limits, boundary_frozen_at, boundary_frozen_by, areas(code, name), projects(id, code, name, org_id)')
    .eq('id', systemId)
    .eq('project_id', id)
    .single()
  const project = system?.projects as { id: string; code: string; name: string; org_id: string } | null | undefined
  if (!system || !project || project.org_id !== ctx.orgId) notFound()
  const area = system.areas as { code: string; name: string } | null

  const depSelect = `id, system_id, depends_on_system_id, kind, notes, source, required_gate_id, blocked_gate_id,
    provider:systems!system_dependencies_depends_on_system_id_fkey(id, code, name),
    dependent:systems!system_dependencies_system_id_fkey(id, code, name)`

  const [subs, tags, { data: deps }, { data: projectSystems }, { data: gates }, { data: frozenBy }, { data: events }] = await Promise.all([
    supabase.from('subsystems').select('id', { count: 'exact', head: true }).eq('system_id', systemId),
    supabase.from('tags').select('id, subsystems!inner(system_id)', { count: 'exact', head: true }).eq('subsystems.system_id', systemId),
    supabase.from('system_dependencies').select(depSelect).eq('project_id', id).or(`system_id.eq.${system.id},depends_on_system_id.eq.${system.id}`),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('readiness_gates').select('id, code, name, order_index, is_active').eq('org_id', ctx.orgId).order('order_index'),
    system.boundary_frozen_by
      ? supabase.from('profiles').select('full_name').eq('id', system.boundary_frozen_by).maybeSingle()
      : Promise.resolve({ data: null }),
    // Solo owner/admin leen activity_log (RLS); para el resto la lista llega vacía.
    supabase.from('activity_log').select('id, action, payload, created_at, user_id')
      .eq('entity_type', 'system').eq('entity_id', systemId).like('action', 'boundary%')
      .order('created_at', { ascending: false }).limit(50),
  ])

  const gateCode = Object.fromEntries((gates ?? []).map(g => [g.id, g.code]))
  const toRow = (d: NonNullable<typeof deps>[number], other: { id: string; code: string; name: string } | null): DependencyRow => ({
    id: d.id,
    kind: d.kind as DependencyKind,
    notes: d.notes,
    source: d.source as DependencyRow['source'],
    other: other ?? { id: '', code: '?', name: '' },
    required: gateCode[d.required_gate_id] ?? '?',
    blocked: gateCode[d.blocked_gate_id] ?? '?',
  })
  const dependsOn = (deps ?? []).filter(d => d.system_id === systemId)
    .map(d => toRow(d, d.provider as unknown as { id: string; code: string; name: string } | null))
  const enables = (deps ?? []).filter(d => d.depends_on_system_id === systemId)
    .map(d => toRow(d, d.dependent as unknown as { id: string; code: string; name: string } | null))

  return (
    <SystemDetailView
      project={{ id: project.id, code: project.code, name: project.name }}
      system={{
        id: system.id,
        code: system.code,
        name: system.name,
        area: area ? `${area.code} — ${area.name}` : '',
        system_type: (system.system_type as SystemType | null) ?? null,
        priority: system.priority,
        battery_limits: (system.battery_limits ?? {}) as BatteryLimits,
        frozenAt: system.boundary_frozen_at,
        frozenBy: (frozenBy as { full_name: string | null } | null)?.full_name ?? null,
        subsystems: subs.count ?? 0,
        tags: tags.count ?? 0,
      }}
      dependsOn={dependsOn}
      enables={enables}
      otherSystems={(projectSystems ?? []).filter(s => s.id !== systemId)}
      gates={(gates ?? []).filter(g => g.is_active)}
      events={(events ?? []) as unknown as BoundaryEvent[]}
      canEdit={EDITOR_ROLES.includes(ctx.role)}
    />
  )
}
