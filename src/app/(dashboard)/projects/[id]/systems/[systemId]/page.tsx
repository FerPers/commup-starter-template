import { getActiveMembership } from '@/lib/supabase/membership'
import RememberRecent from '@/components/layout/RememberRecent'
import { notFound, redirect } from 'next/navigation'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { loadMyCapacities } from '@/lib/capacities/server'
import { getProjectToday } from '@/lib/time/project-zones'
import { isApproved, type SystemGate } from '@/lib/readiness/gates'
import { nextGate } from '@/lib/readiness/matrix'
import { parseSystemTab } from '@/lib/systems/file-tabs'
import type { OwnershipStage } from '@/lib/startup/catalog'
import type { PackageStatus } from '@/lib/vendors/catalog'
import type { BatteryLimits, DependencyKind, SystemType } from '@/lib/systems/dependencies'
import SystemDetailView, { type DependencyRow, type BoundaryEvent } from './SystemDetailView'
import SystemGatesView from './SystemGatesView'
import type { GatePlanEvent } from './GatePlanPanel'
import SystemDrawingsTab, { type SystemPidSheets } from './SystemDrawingsTab'
import { loadSystemLosh } from '@/lib/pid/losh-server'
import {
  SystemFileShell, SystemPlanTab, SystemStartupTab, SystemTransferTab, SystemVendorsTab,
  type SystemPerformance, type SystemVendor,
} from './SystemFileTabs'
import { fromJson } from '@/lib/supabase/casts'

export default async function SystemFilePage({ params, searchParams }: {
  params: Promise<{ id: string; systemId: string }>
  searchParams: Promise<{ tab?: string; gate?: string }>
}) {
  const [{ id, systemId }, sp] = await Promise.all([params, searchParams])
  const tab = parseSystemTab(sp)
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const canEdit = EDITOR_ROLES.includes(ctx.role)

  const { data: system } = await supabase
    .from('systems')
    .select('id, code, name, color, project_id, system_type, priority, battery_limits, boundary_frozen_at, boundary_frozen_by, areas(code, name), projects(id, code, name, org_id, timezone)')
    .eq('id', systemId)
    .eq('project_id', id)
    .maybeSingle()
  const project = system?.projects as { id: string; code: string; name: string; org_id: string; timezone: string | null } | null | undefined
  if (!system || !project || project.org_id !== ctx.orgId) notFound()
  const area = system.areas as { code: string; name: string } | null
  const projectRef = { id: project.id, code: project.code, name: project.name, timezone: project.timezone }

  const depSelect = `id, system_id, depends_on_system_id, kind, notes, source, required_gate_id, blocked_gate_id,
    provider:systems!system_dependencies_depends_on_system_id_fkey(id, code, name),
    dependent:systems!system_dependencies_system_id_fkey(id, code, name)`

  // ── Encabezado (siempre) ─────────────────────────────────────────────
  const [{ data: gatesRaw, error: gatesError }, { data: progress }, { data: plans }, { data: ownership }, { data: pendingTransfer }, { data: perfTests }, { data: vendorRows }, { data: deps }, day, { data: pidCoverage }] = await Promise.all([
    supabase.rpc('compute_system_gates', { p_system_id: systemId }),
    supabase.rpc('compute_system_progress', { p_system_id: systemId }),
    // bounded: una fila por gate del sistema
    supabase.from('system_gate_plans').select('gate_id, forecast_date, commitment_date').eq('system_id', systemId).limit(100),
    supabase.from('system_ownership').select('stage').eq('system_id', systemId).maybeSingle(),
    supabase.from('ownership_transfers').select('id').eq('system_id', systemId).eq('status', 'pending_signatures').maybeSingle(),
    // Prueba de desempeño (fase 7): pruebas de las que el sistema es principal, último intento y PTC vigente.
    supabase.from('performance_tests')
      .select('id, number, title, performance_runs!performance_runs_test_id_fkey(attempt, status, result), performance_certificates!performance_certificates_test_id_fkey(number, status)')
      .eq('primary_system_id', systemId).order('number').limit(50),
    // Paquetes de vendor del sistema (fase 8).
    supabase.from('vendor_package_systems')
      .select('vendor_packages!inner(id, number, title, status, companies(name, short_name))')
      .eq('system_id', systemId).limit(50),
    supabase.from('system_dependencies').select(depSelect)
      .eq('project_id', id).or(`system_id.eq.${system.id},depends_on_system_id.eq.${system.id}`).limit(500),
    getProjectToday(supabase, id),
    // E2: cobertura del P&ID (tags del sistema con pin en la revisión vigente).
    supabase.rpc('compute_project_pid_coverage', { p_project_id: id }),
  ])
  if (gatesError) console.error('[SystemFile] gates rpc error:', gatesError)
  const gates = (gatesRaw ?? []) as SystemGate[]

  const performance = (perfTests ?? []).map(pt => {
    const runs = [...(pt.performance_runs ?? [])].sort((a, b) => b.attempt - a.attempt)
    const cert = (pt.performance_certificates ?? []).find(c => c.status === 'pending_signatures' || c.status === 'accepted') ?? null
    return { id: pt.id, number: pt.number, title: pt.title, lastRun: runs[0] ? { status: runs[0].status, result: runs[0].result } : null, certificate: cert }
  }) as SystemPerformance[]
  const vendors: SystemVendor[] = (vendorRows ?? []).map(r => {
    const v = r.vendor_packages
    return { id: v.id, number: v.number, title: v.title, status: v.status as PackageStatus, company: v.companies?.short_name?.trim() ? v.companies.short_name : v.companies?.name ?? '' }
  }).filter(v => v.status !== 'cancelled').sort((a, b) => a.number.localeCompare(b.number))

  const ownershipState = { stage: (ownership?.stage ?? 'commissioning') as OwnershipStage, pendingTransferId: pendingTransfer?.id ?? null }
  const planByGate = Object.fromEntries((plans ?? []).map(p => [p.gate_id, { forecast_date: p.forecast_date, commitment_date: p.commitment_date }]))
  const next = nextGate(gates.map(g => ({ gate_id: g.gate_id, code: g.gate_code, name: g.gate_name, order: g.gate_order, computed_level: g.computed_level, status: g.status, failing: 0, approval: null })))
  const nextPlan = next ? planByGate[next.gate_id] : undefined
  const progressRows = progress ?? []
  const summary = {
    approved: gates.filter(g => isApproved(g.status) && g.status !== 'regressed').length,
    total: gates.length,
    attention: gates.filter(g => g.status === 'regressed' || g.status === 'approved_needs_review').length,
    weightedPct: progressRows.reduce((sum, p) => sum + Number(p.weight) * Number(p.pct), 0),
    itrs: progressRows.reduce((n, p) => n + p.itr_total, 0),
    next: next ? { code: next.code, status: next.status } : null,
    commitment: next && nextPlan?.commitment_date
      ? { gate: next.code, date: nextPlan.commitment_date, late: nextPlan.commitment_date < day.today, forecast: nextPlan.forecast_date }
      : null,
    pid: (() => {
      const c = (pidCoverage ?? []).find(x => x.system_id === systemId)
      return c && c.tags_total > 0 ? { pinned: c.tags_pinned, total: c.tags_total } : null
    })(),
  }
  const depRows = deps ?? []

  // ── Pestaña ──────────────────────────────────────────────────────────
  const loadNames = async () => {
    // bounded: miembros de la org
    const { data: members } = await supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId).limit(2000)
    const names: Record<string, string> = {}
    for (const m of members ?? []) {
      const p = m.profiles as { full_name: string | null } | null
      if (p?.full_name) names[m.user_id] = p.full_name
    }
    return names
  }

  let content: React.ReactNode = null
  if (tab === 'gates') {
    const [{ data: phases }, names, caps] = await Promise.all([
      // bounded: fases de la org
      supabase.from('project_phases').select('id, code').eq('org_id', ctx.orgId).limit(100),
      loadNames(),
      loadMyCapacities(ctx.supabase, project.id),
    ])
    // S23 (D-25): dependencias en las que este sistema es proveedor (impacto de aprobar o revocar).
    const provides = depRows.filter(d => d.depends_on_system_id === systemId && d.dependent)
      .map(d => ({ system_code: (d.dependent).code, required_gate_id: d.required_gate_id, blocked_gate_id: d.blocked_gate_id }))
    content = (
      <SystemGatesView
        orgId={ctx.orgId} role={ctx.role} userId={ctx.userId} caps={caps} canEdit={canEdit}
        project={projectRef}
        system={{ id: system.id, code: system.code, name: system.name, area: area ? `${area.code} — ${area.name}` : '' }}
        gates={gates} names={names}
        phaseCodes={Object.fromEntries((phases ?? []).map(ph => [ph.id, ph.code]))}
        provides={provides}
        focusGateId={sp.gate ?? null}
      />
    )
  } else if (tab === 'plan') {
    const [{ data: planEvents }, { data: constraints }, { data: actions }, names] = await Promise.all([
      supabase.from('system_gate_plan_events').select('id, gate_id, kind, from_date, to_date, reason, user_id, created_at')
        .eq('system_id', systemId).order('created_at').limit(500),
      supabase.from('project_constraints')
        .select('id, number, title, status, escalation_level, need_date, readiness_gates(code)')
        .eq('system_id', systemId).in('status', ['open', 'resolved'])
        .order('escalation_level', { ascending: false }).order('need_date').limit(200),
      supabase.from('actions')
        .select('id, number, title, status, priority, due_date, owner_id')
        .eq('system_id', systemId).in('status', ['open', 'in_progress', 'done'])
        .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
      loadNames(),
    ])
    content = (
      <SystemPlanTab
        project={projectRef} systemId={system.id} names={names} canEdit={ctx.role !== 'client'}
        gates={gates.map(g => ({ gate_id: g.gate_id, gate_code: g.gate_code, gate_name: g.gate_name, status: g.status, settled: isApproved(g.status) && g.status !== 'regressed' }))}
        planning={{
          progress: Object.fromEntries(progressRows.map(p => [p.gate_id, { weight: Number(p.weight), itr_total: p.itr_total, itr_approved: p.itr_approved, pct: Number(p.pct) }])),
          plans: planByGate,
          events: (planEvents ?? []) as (GatePlanEvent & { gate_id: string })[],
          canCommit: canEdit,
        }}
        daily={{
          constraints: (constraints ?? []).map(c => ({ ...c, gate: (c.readiness_gates)?.code ?? null })),
          actions: actions ?? [],
        }}
      />
    )
  } else if (tab === 'startup') {
    const { data: milestones } = await supabase.from('startup_events').select('id, milestone, occurred_at, status')
      .eq('system_id', systemId).eq('kind', 'milestone').neq('status', 'voided').limit(50)
    content = (
      <SystemStartupTab project={projectRef} systemId={system.id}
        milestones={(milestones ?? []).map(m => ({ id: m.id, milestone: m.milestone as string, occurredAt: m.occurred_at, status: m.status }))} />
    )
  } else if (tab === 'transfer') {
    const { data: transfers } = await supabase.from('ownership_transfers').select('id, number, from_stage, to_stage, status, requested_at')
      .eq('system_id', systemId).order('requested_at', { ascending: false }).limit(50)
    content = <SystemTransferTab project={projectRef} ownership={ownershipState} transfers={transfers ?? []} />
  } else if (tab === 'vendors') {
    content = <SystemVendorsTab project={projectRef} performance={performance} vendors={vendors} />
  } else if (tab === 'drawings') {
    // P4: controles del LOSH (pines cruzados, conectores sin par) y el PDF por sistema.
    // F-21c: estados de sus red-lines (tarjeta y PDF de red-lines).
    const [{ data: sheets, error }, losh, { data: rls }] = await Promise.all([
      supabase.rpc('system_pid_sheets', { p_system_id: systemId }),
      loadSystemLosh(supabase, { projectId: project.id, systemId }),
      // bounded: red-lines de un sistema (tope 1000)
      supabase.from('pid_redlines').select('status').eq('project_id', project.id).eq('system_id', systemId).limit(1000),
    ])
    if (error) throw new Error(error.message)
    const redlineCounts = { open: 0, accepted: 0, rejected: 0, incorporated: 0 } as Record<string, number>
    for (const r of rls ?? []) redlineCounts[r.status] = (redlineCounts[r.status] ?? 0) + 1
    content = <SystemDrawingsTab projectId={project.id} systemId={system.id} data={fromJson<SystemPidSheets>(sheets)} losh={losh} canEdit={canEdit}
      redlines={{ total: (rls ?? []).length, open: redlineCounts.open, accepted: redlineCounts.accepted, incorporated: redlineCounts.incorporated }} />
  } else {
    // Datos del sistema y Dependencias: la ficha de Sistemas (fase 2), sin su encabezado.
    const [subs, tags, { data: projectSystems }, { data: orgGates }, { data: frozenBy }, { data: events }] = await Promise.all([
      supabase.from('subsystems').select('id', { count: 'exact', head: true }).eq('system_id', systemId),
      supabase.from('tags').select('id, subsystems!inner(system_id)', { count: 'exact', head: true }).eq('subsystems.system_id', systemId),
      // bounded: sistemas del proyecto (cientos)
      supabase.from('systems').select('id, code, name').eq('project_id', id).order('code').limit(2000),
      supabase.from('readiness_gates').select('id, code, name, order_index, is_active').eq('org_id', ctx.orgId).order('order_index').limit(100),
      system.boundary_frozen_by
        ? supabase.from('profiles').select('full_name').eq('id', system.boundary_frozen_by).maybeSingle()
        : Promise.resolve({ data: null }),
      // Solo owner/admin leen activity_log (RLS); para el resto la lista llega vacía.
      supabase.from('activity_log').select('id, action, payload, created_at, user_id')
        .eq('entity_type', 'system').eq('entity_id', systemId).like('action', 'boundary%')
        .order('created_at', { ascending: false }).limit(50),
    ])
    const gateCode = Object.fromEntries((orgGates ?? []).map(g => [g.id, g.code]))
    const toRow = (d: (typeof depRows)[number], other: { id: string; code: string; name: string } | null): DependencyRow => ({
      id: d.id,
      kind: d.kind as DependencyKind,
      notes: d.notes,
      source: d.source as DependencyRow['source'],
      other: other ?? { id: '', code: '?', name: '' },
      required: gateCode[d.required_gate_id] ?? '?',
      blocked: gateCode[d.blocked_gate_id] ?? '?',
    })
    content = (
      <SystemDetailView
        section={tab === 'deps' ? 'deps' : 'data'}
        project={{ id: project.id, code: project.code, name: project.name }}
        system={{
          id: system.id, code: system.code, name: system.name,
          area: area ? `${area.code} — ${area.name}` : '',
          system_type: (system.system_type as SystemType | null) ?? null,
          priority: system.priority,
          color: system.color,
          battery_limits: (system.battery_limits ?? {}) as BatteryLimits,
          frozenAt: system.boundary_frozen_at,
          frozenBy: (frozenBy as { full_name: string | null } | null)?.full_name ?? null,
          subsystems: subs.count ?? 0,
          tags: tags.count ?? 0,
        }}
        dependsOn={depRows.filter(d => d.system_id === systemId).map(d => toRow(d, d.provider))}
        enables={depRows.filter(d => d.depends_on_system_id === systemId).map(d => toRow(d, d.dependent))}
        otherSystems={(projectSystems ?? []).filter(s => s.id !== systemId)}
        gates={(orgGates ?? []).filter(g => g.is_active)}
        events={(events ?? []) as BoundaryEvent[]}
        canEdit={canEdit}
      />
    )
  }

  return (
    <>
    <RememberRecent kind="system" code={system.code} title={system.name} href={`/projects/${project.id}/systems/${system.id}`} projectCode={project.code} />
    <SystemFileShell
      project={projectRef}
      system={{ id: system.id, code: system.code, name: system.name, area: area ? `${area.code} — ${area.name}` : '', system_type: (system.system_type as SystemType | null) ?? null, priority: system.priority }}
      tab={tab}
      summary={summary}
      ownership={ownershipState}
      performance={performance}
      vendors={vendors}
      badges={{ gates: summary.attention, deps: depRows.length, vendors: vendors.length + performance.length }}
    >
      {content}
    </SystemFileShell>
    </>
  )
}
