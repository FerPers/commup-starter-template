/**
 * S23: datos de la matriz de Control Tower (página y Excel). Todo desde el motor de gates y su estado guardado;
 * nada del motor viejo (compute_project_readiness).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { getProjectToday } from '@/lib/time/project-zones'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { gatePolicy, type MatrixGate } from './gates'
import { dependencyBlocks, type SystemType } from '@/lib/systems/dependencies'
import type { MatrixRow } from './matrix'

export type MatrixData = {
  rows: MatrixRow[]
  /** Avance físico ponderado por sistema (fracción 0–1) e ITR que pesan. */
  weighted: Map<string, { pct: number; itrs: number }>
  punches: Map<string, { a: number; b: number }>
  sysInfo: Map<string, { system_type: SystemType | null; priority: number | null }>
  /** `${systemId}:${gateId}` → códigos de sistemas proveedores que lo bloquean. */
  blocks: Map<string, string[]>
  /** `${systemId}:${gateId}` → fecha comprometida. */
  commitments: Map<string, string>
  /** approvalId → condiciones (acciones de origen «gate») abiertas. */
  openConditions: Map<string, number>
  /** Sistemas con eventos de gate en las últimas 24 h. */
  changedIds: Set<string>
  today: string
  timezone: string
  catBLimit: number | null
}

export async function loadMatrix(supabase: SupabaseClient<Database>, projectId: string, orgId: string): Promise<MatrixData> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const [gates, progress, punches, systems, deps, org, plans, conditions, events, day] = await Promise.all([
    supabase.rpc('compute_project_gates', { p_project_id: projectId }),
    supabase.rpc('compute_project_progress', { p_project_id: projectId }),
    supabase.rpc('system_open_punches', { p_project_id: projectId }),
    supabase.from('systems').select('id, code, system_type, priority').eq('project_id', projectId),
    fetchAllRows(() => supabase.from('system_dependencies').select('system_id, depends_on_system_id, required_gate_id, blocked_gate_id').eq('project_id', projectId)),
    supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle(),
    // La clave de system_gate_plans es (system_id, gate_id): no tiene columna id para paginar.
    fetchAllRows(() => supabase.from('system_gate_plans').select('system_id, gate_id, commitment_date').eq('project_id', projectId).not('commitment_date', 'is', null).order('gate_id'), { key: 'system_id' }),
    fetchAllRows(() => supabase.from('actions').select('source_id').eq('project_id', projectId).eq('source_kind', 'gate').in('status', ['open', 'in_progress', 'done'])),
    supabase.from('domain_events').select('payload').eq('project_id', projectId).eq('aggregate_type', 'gate').gte('occurred_at', since).limit(1000),
    getProjectToday(supabase, projectId),
  ])
  if (gates.error) console.error('[ControlTower] gates rpc error:', gates.error)

  const rows: MatrixRow[] = (gates.data ?? []).map(r => ({
    system_id: r.system_id, system_code: r.system_code, system_name: r.system_name, area_code: r.area_code, area_name: r.area_name,
    gates: (r.gates ?? []) as unknown as MatrixGate[],
  }))
  const gatesBySystem = new Map(rows.map(r => [r.system_id, r.gates]))
  const codes = new Map((systems.data ?? []).map(s => [s.id, s.code]))

  const settings = org.data?.settings as Record<string, unknown> | null | undefined
  const rawLimit = settings && 'max_open_cat_b_per_subsystem' in settings ? settings.max_open_cat_b_per_subsystem : 3
  const changedIds = new Set<string>()
  for (const e of events.data ?? []) {
    const sid = (e.payload as { system_id?: string } | null)?.system_id
    if (sid) changedIds.add(sid)
  }
  const openConditions = new Map<string, number>()
  for (const a of conditions) if (a.source_id) openConditions.set(a.source_id, (openConditions.get(a.source_id) ?? 0) + 1)

  return {
    rows,
    weighted: new Map((progress.data ?? []).map(p => [p.system_id, { pct: Number(p.weighted_pct), itrs: p.itr_total }])),
    punches: new Map((punches.data ?? []).map(p => [p.system_id, { a: p.open_a, b: p.open_b }])),
    sysInfo: new Map((systems.data ?? []).map(s => [s.id, { system_type: s.system_type as SystemType | null, priority: s.priority }])),
    blocks: dependencyBlocks(
      deps,
      (systemId, gateId) => gatesBySystem.get(systemId)?.find(x => x.gate_id === gateId)?.status,
      systemId => codes.get(systemId) ?? '?',
      gatePolicy(org.data?.settings).regressed_dependency,  // S11 (D13)
    ),
    commitments: new Map(plans.map(p => [`${p.system_id}:${p.gate_id}`, p.commitment_date as string])),
    openConditions,
    changedIds,
    today: day.today,
    timezone: day.timezone,
    catBLimit: typeof rawLimit === 'number' ? Math.max(0, Math.trunc(rawLimit)) : null,
  }
}
