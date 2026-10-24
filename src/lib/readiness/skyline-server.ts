/**
 * E1: datos del skyline de liberación (página y Excel). Estado del gate del motor guardado (`compute_project_gates`),
 * fechas de `system_gate_plans` y avance por gate de `compute_project_gate_progress`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { getProjectToday } from '@/lib/time/project-zones'
import { fetchAllRows } from '@/lib/list/fetch-all'
import type { MatrixGate } from './gates'
import { buildSkyline, defaultSkylineGate, type Skyline, type SkylineParams } from './skyline'
import { fromJson } from '@/lib/supabase/casts'

export type SkylineGate = { gateId: string; code: string; name: string; order: number }

export type SkylineData = {
  gates: SkylineGate[]
  /** La liberación a la vista (la de la URL si existe, si no la primera sin aprobar en todos). */
  gate: SkylineGate | null
  view: SkylineParams
  sky: Skyline
  today: string
}

export async function loadSkyline(supabase: SupabaseClient<Database>, projectId: string, p: SkylineParams): Promise<SkylineData> {
  const [{ data: gatesRaw, error }, plans, { data: progress }, day] = await Promise.all([
    supabase.rpc('compute_project_gates', { p_project_id: projectId }),
    // La clave de system_gate_plans es (system_id, gate_id): no tiene columna id para paginar.
    fetchAllRows(() => supabase.from('system_gate_plans').select('system_id, gate_id, commitment_date, forecast_date')
      .eq('project_id', projectId).or('commitment_date.not.is.null,forecast_date.not.is.null').order('gate_id'), { key: 'system_id' }),
    supabase.rpc('compute_project_gate_progress', { p_project_id: projectId }),
    getProjectToday(supabase, projectId),
  ])
  if (error) console.error('[Skyline] gates rpc error:', error)

  const rows = (gatesRaw ?? []).map(r => ({ ...r, gates: fromJson<MatrixGate[]>((r.gates ?? [])) }))
  const gates: SkylineGate[] = (rows[0]?.gates ?? []).map(g => ({ gateId: g.gate_id, code: g.code, name: g.name, order: g.order }))
    .sort((a, b) => a.order - b.order)
  const fallback = defaultSkylineGate(gates.map(g => ({
    gateId: g.gateId, order: g.order, statuses: rows.map(r => r.gates.find(x => x.gate_id === g.gateId)?.status ?? 'not_ready'),
  })))
  const gate = gates.find(g => g.gateId === p.gate) ?? gates.find(g => g.gateId === fallback) ?? null
  const gateId = gate?.gateId

  const planMap = new Map(plans.filter(x => x.gate_id === gateId).map(x => [x.system_id, x]))
  const progMap = new Map((progress ?? []).filter(x => x.gate_id === gateId).map(x => [x.system_id, x]))
  const sky = buildSkyline(rows.map(r => {
    const plan = planMap.get(r.system_id)
    const prog = progMap.get(r.system_id)
    return {
      systemId: r.system_id, systemCode: r.system_code, systemName: r.system_name, areaCode: r.area_code,
      status: r.gates.find(g => g.gate_id === gateId)?.status ?? 'not_ready',
      commitment: plan?.commitment_date ?? null, forecast: plan?.forecast_date ?? null,
      pct: Number(prog?.pct ?? 0), itrTotal: prog?.itr_total ?? 0,
    }
  }), day.today, p.scale, p.from)

  return { gates, gate, view: { ...p, gate: gateId }, sky, today: day.today }
}
