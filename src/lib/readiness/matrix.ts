/**
 * S23 (D-01/D-18/D-19): lógica pura de la matriz de Control Tower. Todo sale de `compute_project_gates` (motor de
 * gates, estado guardado de S20): el siguiente gate no aprobado de cada sistema, por qué no avanza, su riesgo para
 * ordenar, los filtros de la URL y un único número de readiness para todas las pantallas.
 */
import { isApproved, type GateBlocker, type GateStatus, type MatrixGate } from './gates'

/** Aprobado y vigente (un gate en regresión o con una condición nueva no cuenta como hecho). */
export const isDone = (s: GateStatus) => s === 'approved' || s === 'approved_with_conditions'

/** Siguiente gate que pide trabajo: el primero en regresión o por revisar, o si no, el primero no aprobado. */
export function nextGate(gates: readonly MatrixGate[]): MatrixGate | null {
  const sorted = [...gates].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
  return sorted.find(g => g.status === 'regressed' || g.status === 'approved_needs_review')
    ?? sorted.find(g => !isApproved(g.status))
    ?? null
}

export type RowState = 'regressed' | 'blocked' | 'signing' | 'ready' | 'done'

/** Estado de la fila según su siguiente gate (lo que se filtra y colorea). */
export function rowState(gates: readonly MatrixGate[]): RowState {
  const g = nextGate(gates)
  if (!g) return 'done'
  if (g.status === 'regressed' || g.status === 'approved_needs_review') return 'regressed'
  if (g.status === 'pending_signatures') return 'signing'
  if (g.status === 'ready' || g.status === 'ready_with_conditions') return 'ready'
  return 'blocked'
}

const STATE_RISK: Record<RowState, number> = { regressed: 0, blocked: 1, signing: 2, ready: 3, done: 4 }

/** Cuántas cosas faltan según el criterio que falla (el número que acompaña al texto). */
export function blockerCount(b: GateBlocker | null | undefined): number | null {
  if (!b) return null
  const d = b.detail ?? {}
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null)
  if (b.kind === 'itr_phase_approved') {
    const total = num('itr_total'); const ok = num('itr_approved')
    if (total !== null && ok !== null && total > ok) return total - ok
    return num('subsystems_red')
  }
  return num('missing_count') ?? num('blocking_count') ?? num('open_count') ?? num('failing_count') ?? null
}

export type MatrixRow = {
  system_id: string
  system_code: string
  system_name: string
  area_code: string
  area_name: string
  gates: MatrixGate[]
}

export type MatrixFilters = {
  area?: string
  state?: RowState
  q?: string
  /** Solo sistemas cuyo siguiente gate tiene compromiso dentro de N días (o ya vencido). */
  committedDays?: number
  /** Solo sistemas que cambiaron en las últimas 24 h (reunión diaria). */
  changed?: boolean
  /** N2a: solo sistemas cuyo siguiente gate es este código (fila del Resumen por fases). */
  gate?: string
  /** N2a: solo los que no avanzan (siguiente gate bloqueado o en regresión). */
  blocked?: boolean
  sort?: 'risk' | 'code' | 'commitment'
}

const STATES: RowState[] = ['regressed', 'blocked', 'signing', 'ready', 'done']

/** Filtros desde la URL (todo lo desconocido se ignora). */
export function parseMatrixFilters(sp: Record<string, string | undefined>): MatrixFilters {
  const days = Number(sp.committed)
  return {
    area: sp.area?.trim() ? sp.area : undefined,
    state: STATES.includes(sp.state as RowState) ? (sp.state as RowState) : undefined,
    q: sp.q?.trim() ? sp.q.trim() : undefined,
    committedDays: Number.isInteger(days) && days > 0 && days <= 365 ? days : undefined,
    changed: sp.changed === '1',
    gate: sp.gate?.trim() ? sp.gate.trim() : undefined,
    blocked: sp.blocked === '1',
    sort: sp.sort === 'code' || sp.sort === 'commitment' ? sp.sort : 'risk',
  }
}

/**
 * Aplica filtros y orden. `commitment(systemId, gateId)` = fecha comprometida (YYYY-MM-DD) del siguiente gate;
 * `changedIds` = sistemas con eventos de gate en las últimas 24 h; `today` = día del proyecto.
 */
export function filterMatrix<T extends MatrixRow>(rows: readonly T[], f: MatrixFilters, ctx: {
  commitment: (systemId: string, gateId: string) => string | null
  changedIds: ReadonlySet<string>
  today: string
}): T[] {
  const q = f.q?.toLowerCase()
  const limit = f.committedDays ? addDays(ctx.today, f.committedDays) : null
  const commitOf = (r: T) => {
    const g = nextGate(r.gates)
    return g ? ctx.commitment(r.system_id, g.gate_id) : null
  }
  const out = rows.filter(r => {
    if (f.area && r.area_code !== f.area) return false
    if (f.state && rowState(r.gates) !== f.state) return false
    if (q && !`${r.system_code} ${r.system_name}`.toLowerCase().includes(q)) return false
    if (f.changed && !ctx.changedIds.has(r.system_id)) return false
    if (f.gate && nextGate(r.gates)?.code !== f.gate) return false
    if (f.blocked && !['blocked', 'regressed'].includes(rowState(r.gates))) return false
    if (limit) {
      const c = commitOf(r)
      if (!c || c > limit) return false
    }
    return true
  })
  const byCode = (a: T, b: T) => a.area_code.localeCompare(b.area_code) || a.system_code.localeCompare(b.system_code)
  if (f.sort === 'code') return out.sort(byCode)
  if (f.sort === 'commitment') {
    return out.sort((a, b) => (commitOf(a) ?? '9999-12-31').localeCompare(commitOf(b) ?? '9999-12-31') || byCode(a, b))
  }
  return out.sort((a, b) => STATE_RISK[rowState(a.gates)] - STATE_RISK[rowState(b.gates)]
    || (nextGate(a.gates)?.order ?? 99) - (nextGate(b.gates)?.order ?? 99) || byCode(a, b))
}

/**
 * D-18: el único «readiness» del producto: gates aprobados y vigentes sobre el total de gates activos de todos los
 * sistemas (misma definición en Control Tower, KPIs y el reporte).
 */
export function readinessSummary(gatesBySystem: Iterable<readonly MatrixGate[]>): { done: number; total: number; pct: number } {
  let done = 0
  let total = 0
  for (const gates of gatesBySystem) {
    total += gates.length
    done += gates.filter(g => isDone(g.status)).length
  }
  return { done, total, pct: total > 0 ? done / total : 0 }
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
