/**
 * N2b (D-38): liberación por proyecto para la tabla del Portafolio (/dashboard, widget `readiness`; V1: /control-tower
 * solo redirige).
 * Gates materializados (S20): un `compute_project_gates` por proyecto; compromisos y restricciones N4 en dos
 * consultas para todos los proyectos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { MatrixGate } from './gates'
import { isDone, nextGate, readinessSummary, rowState, type RowState } from './matrix'
import { addDaysIso, todayIn } from '@/lib/time/zone'
import { fromJson } from '@/lib/supabase/casts'

export const ROW_STATES: RowState[] = ['regressed', 'blocked', 'signing', 'ready', 'done']

export type ProjectReadiness = {
  id: string
  code: string
  name: string
  /** E2: cliente del proyecto y su logo (fila del Portafolio). */
  client: string | null
  clientLogoUrl: string | null
  systems: number
  readiness: { done: number; total: number; pct: number }
  weighted: number
  counts: Record<RowState, number>
  /** Restricciones abiertas en nivel 4 (bloquean su gate). */
  constraintsN4: number
  /** Siguiente gate con compromiso vencido o dentro de 7 días. */
  commitmentsSoon: number
}

export async function loadPortfolioReadiness(supabase: SupabaseClient<Database>, orgId: string, limit = 200): Promise<ProjectReadiness[]> {
  // bounded: proyectos de la org (decenas)
  const { data: projects } = await supabase.from('projects').select('id, code, name, timezone, client, client_logo_url').eq('org_id', orgId).order('code').limit(limit)
  const list = projects ?? []
  if (!list.length) return []
  const ids = list.map(p => p.id)
  const [{ data: plans }, { data: n4 }] = await Promise.all([
    // bounded: solo compromisos fijados, tope para el portafolio
    supabase.from('system_gate_plans').select('project_id, system_id, gate_id, commitment_date').in('project_id', ids).not('commitment_date', 'is', null).limit(5000),
    supabase.from('project_constraints').select('project_id').in('project_id', ids).eq('status', 'open').eq('escalation_level', 4).limit(5000),
  ])
  const commits = new Map((plans ?? []).map(p => [`${p.system_id}:${p.gate_id}`, p.commitment_date as string]))

  return Promise.all(list.map(async p => {
    const [gates, progress] = await Promise.all([
      supabase.rpc('compute_project_gates', { p_project_id: p.id }),
      supabase.rpc('compute_project_progress', { p_project_id: p.id }),
    ])
    const rows = (gates.data ?? []).map(r => ({ system_id: r.system_id, gates: fromJson<MatrixGate[]>((r.gates ?? [])) }))
    const counts = Object.fromEntries(ROW_STATES.map(s => [s, 0])) as Record<RowState, number>
    const soonLimit = addDaysIso(todayIn(p.timezone), 7)
    let commitmentsSoon = 0
    for (const r of rows) {
      counts[rowState(r.gates)]++
      const g = nextGate(r.gates)
      const c = g && !isDone(g.status) ? commits.get(`${r.system_id}:${g.gate_id}`) : undefined
      if (c && c <= soonLimit) commitmentsSoon++
    }
    const prog = progress.data ?? []
    const itrs = prog.reduce((n, x) => n + x.itr_total, 0)
    return {
      id: p.id, code: p.code, name: p.name, client: p.client, clientLogoUrl: p.client_logo_url,
      systems: rows.length,
      readiness: readinessSummary(rows.map(r => r.gates)),
      weighted: itrs > 0 ? prog.reduce((n, x) => n + Number(x.weighted_pct) * x.itr_total, 0) / itrs : 0,
      counts,
      constraintsN4: (n4 ?? []).filter(c => c.project_id === p.id).length,
      commitmentsSoon,
    }
  }))
}
