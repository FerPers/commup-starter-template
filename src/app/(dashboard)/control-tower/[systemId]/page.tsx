import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { loadMyCapacities } from '@/lib/capacities/server'
import type { SystemGate } from '@/lib/readiness/gates'
import type { OwnershipStage } from '@/lib/startup/catalog'
import type { PackageStatus } from '@/lib/vendors/catalog'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import SystemGatesView, { type SystemPerformance } from './SystemGatesView'
import type { GatePlanEvent } from './GatePlanPanel'

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
    .select('id, code, name, project_id, areas(code, name), projects(id, code, name, org_id, timezone)')
    .eq('id', systemId)
    .single()

  const project = system?.projects as { id: string; code: string; name: string; org_id: string; timezone: string | null } | null | undefined
  if (!system || !project || project.org_id !== ctx.orgId) notFound()
  const area = system.areas as { code: string; name: string } | null

  const [{ data: gates, error: gatesError }, { data: phases }, { data: members }, { data: deps }, { data: constraints }, { data: actions }, { data: progress }, { data: plans }, { data: planEvents }, { data: milestones }, { data: ownership }, { data: pendingTransfer }] = await Promise.all([
    supabase.rpc('compute_system_gates', { p_system_id: systemId }),
    supabase.from('project_phases').select('id, code').eq('org_id', ctx.orgId),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    supabase.from('system_dependencies')
      .select(`system_id, depends_on_system_id,
        provider:systems!system_dependencies_depends_on_system_id_fkey(id, code),
        dependent:systems!system_dependencies_system_id_fkey(id, code)`)
      .eq('project_id', system.project_id)
      .or(`system_id.eq.${system.id},depends_on_system_id.eq.${system.id}`),
    // Gestión diaria (fase 5): nada oculto en el detalle del sistema.
    supabase.from('project_constraints')
      .select('id, number, title, status, escalation_level, need_date, readiness_gates(code)')
      .eq('system_id', systemId).in('status', ['open', 'resolved'])
      .order('escalation_level', { ascending: false }).order('need_date'),
    supabase.from('actions')
      .select('id, number, title, status, priority, due_date, owner_id')
      .eq('system_id', systemId).in('status', ['open', 'in_progress', 'done'])
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    // Planificación (fase 5, sesión 2): avance ponderado por gate y forecast/compromiso con historial.
    supabase.rpc('compute_system_progress', { p_system_id: systemId }),
    supabase.from('system_gate_plans').select('gate_id, forecast_date, commitment_date').eq('system_id', systemId),
    supabase.from('system_gate_plan_events').select('id, gate_id, kind, from_date, to_date, reason, user_id, created_at')
      .eq('system_id', systemId).order('created_at'),
    // Bitácora de arranque (fase 6, sesión 2): hitos vigentes del sistema.
    supabase.from('startup_events').select('id, milestone, occurred_at, status')
      .eq('system_id', systemId).eq('kind', 'milestone').neq('status', 'voided'),
    // Readiness de operaciones (fase 6, sesión 3): etapa de propiedad y traspaso pendiente.
    supabase.from('system_ownership').select('stage').eq('system_id', systemId).maybeSingle(),
    supabase.from('ownership_transfers').select('id').eq('system_id', systemId).eq('status', 'pending_signatures').maybeSingle(),
  ])
  // Prueba de desempeño (fase 7): pruebas de las que el sistema es principal, último intento y PTC vigente.
  const { data: perfTests } = await supabase.from('performance_tests')
    .select('id, number, title, performance_runs!performance_runs_test_id_fkey(attempt, status, result), performance_certificates!performance_certificates_test_id_fkey(number, status)')
    .eq('primary_system_id', systemId).order('number')
  const performance = (perfTests ?? []).map(pt => {
    const runs = [...(pt.performance_runs ?? [])].sort((a, b) => b.attempt - a.attempt)
    const cert = (pt.performance_certificates ?? []).find(c => c.status === 'pending_signatures' || c.status === 'accepted') ?? null
    return { id: pt.id, number: pt.number, title: pt.title, lastRun: runs[0] ? { status: runs[0].status, result: runs[0].result } : null, certificate: cert }
  }) as SystemPerformance[]

  // Paquetes de vendor del sistema (fase 8): número, estado y empresa, como chip junto a la etapa.
  const { data: vendorRows } = await supabase.from('vendor_package_systems')
    .select('vendor_packages!inner(id, number, title, status, companies(name, short_name))')
    .eq('system_id', systemId)
  const vendors = (vendorRows ?? []).map(r => {
    const v = r.vendor_packages as unknown as { id: string; number: string; title: string; status: string; companies: { name: string; short_name: string | null } | null }
    return { id: v.id, number: v.number, title: v.title, status: v.status as PackageStatus, company: v.companies?.short_name?.trim() ? v.companies.short_name : v.companies?.name ?? '' }
  }).filter(v => v.status !== 'cancelled').sort((a, b) => a.number.localeCompare(b.number))

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
      caps={await loadMyCapacities(ctx.supabase, project.id)}
      canEdit={EDITOR_ROLES.includes(ctx.role)}
      project={{ id: project.id, code: project.code, name: project.name, timezone: project.timezone }}
      system={{ id: system.id, code: system.code, name: system.name, area: area ? `${area.code} — ${area.name}` : '' }}
      gates={(gates ?? []) as unknown as SystemGate[]}
      names={names}
      phaseCodes={phaseCodes}
      dependsOn={dependsOn}
      enables={enables}
      planning={{
        progress: Object.fromEntries((progress ?? []).map(p => [p.gate_id, { weight: Number(p.weight), itr_total: p.itr_total, itr_approved: p.itr_approved, pct: Number(p.pct) }])),
        weightedPct: (progress ?? []).reduce((sum, p) => sum + Number(p.weight) * Number(p.pct), 0),
        plans: Object.fromEntries((plans ?? []).map(p => [p.gate_id, { forecast_date: p.forecast_date, commitment_date: p.commitment_date }])),
        events: (planEvents ?? []) as unknown as (GatePlanEvent & { gate_id: string })[],
        canCommit: EDITOR_ROLES.includes(ctx.role),
      }}
      performance={performance}
      vendors={vendors}
      ownership={{ stage: (ownership?.stage ?? 'commissioning') as OwnershipStage, pendingTransferId: pendingTransfer?.id ?? null }}
      milestones={(milestones ?? []).map(m => ({ id: m.id, milestone: m.milestone as string, occurredAt: m.occurred_at, status: m.status }))}
      daily={{
        constraints: (constraints ?? []).map(c => ({ ...c, gate: (c.readiness_gates as unknown as { code: string } | null)?.code ?? null })),
        actions: actions ?? [],
      }}
    />
  )
}
