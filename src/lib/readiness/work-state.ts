/**
 * A08 · E4 (D7 del plan): un gate «no listo» se lee según su causa. Espejo puro de la función SQL `gate_work_state`
 * (supabase/functions-sql/gate_work_state.sql), que guarda el resultado en `system_gate_status.gates[].work_state`;
 * paridad en tests/db/gate-work-state-parity.test.ts con los casos de `work-state.cases.ts`.
 *   blocked = no se resuelve haciendo el trabajo planeado (Cat A, ITR no conforme, Cat B sobre el tope, gate anterior
 *             o sistema proveedor en regresión, registro controlado o restricción en nivel 4);
 *   nodata  = la fase no tiene ITR en el alcance del sistema: no se sabe qué falta (nunca «0 pendientes»);
 *   work    = trabajo en curso (también un gate anterior o un proveedor sin liberar: es la secuencia normal; Luis,
 *             2026-10-25).
 */
import type { GateWorkState } from '@/lib/states/gate'
import type { GateStatus } from './gates'

type CriterionLike = { kind: string; result: string; detail?: Record<string, unknown> | null }

const HARD_KINDS = new Set(['registers_clear', 'constraints_clear'])
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : 0)

export function gateWorkState(status: GateStatus | string, criteria: readonly CriterionLike[] | null | undefined): GateWorkState | null {
  if (status !== 'not_ready') return null
  const failing = (criteria ?? []).filter(c => c.result === 'fail')
  const blocked = failing.some(c => {
    const d = c.detail ?? {}
    if (HARD_KINDS.has(c.kind)) return true
    if (c.kind === 'previous_gate') return d.regressed === true
    if (c.kind === 'dependencies_ready') {
      const deps = Array.isArray(d.dependencies) ? (d.dependencies as { provider_status?: string }[]) : []
      return deps.some(p => p.provider_status === 'regressed')
    }
    if (c.kind === 'itr_phase_approved') {
      const red = Array.isArray(d.red_subsystems) ? (d.red_subsystems as { reason?: string }[]) : []
      return num(d.open_cat_a) > 0 || num(d.itr_rejected) > 0 || red.some(r => r.reason === 'cat_a' || r.reason === 'cat_b_over_limit')
    }
    return false
  })
  if (blocked) return 'blocked'
  const nodata = failing.some(c => c.kind === 'itr_phase_approved' && (c.detail != null && 'error' in c.detail || num(c.detail?.itr_total) === 0))
  return nodata ? 'nodata' : 'work'
}
