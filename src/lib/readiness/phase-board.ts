/**
 * N2b (D-18, «Maquetas N2» aprobadas por Luis 2026-10-21): Resumen del proyecto = tablero por fases.
 * Una fila por gate de la org con: sistemas aprobados (readiness), avance de los ITR de su fase, lo que más bloquea
 * a los sistemas cuyo siguiente gate es ese, y el compromiso más próximo. Todo desde `compute_project_gates`
 * (la misma fuente que la matriz de Readiness), sin consultas propias.
 */
import type { CriterionKind, GateBlocker, GateStatus } from './gates'
import { filterMatrix, isDone, nextGate, rowState, type MatrixRow } from './matrix'

export type PhaseRow = {
  gate_id: string
  code: string
  name: string
  /** Sistemas con el gate aprobado y vigente / sistemas del proyecto. */
  approved: number
  total: number
  toApprove: number
  toSign: number
  regressed: number
  /** ITR de la fase del gate (null si el gate no tiene fase o la fase no tiene ITR). */
  itr: { approved: number; total: number } | null
  /** Sistemas cuyo siguiente gate es este y no avanzan, y el criterio que más se repite entre ellos. */
  blocked: number
  topBlocker: { kind: CriterionKind; label: string | null; systems: number } | null
  /** Compromiso más próximo entre los sistemas que aún no aprueban este gate. */
  commitment: { system_id: string; system_code: string; date: string; forecast: string | null; late: boolean } | null
}

export function buildPhaseBoard(rows: readonly MatrixRow[], ctx: {
  commitments: ReadonlyMap<string, string>
  forecasts: ReadonlyMap<string, string>
  today: string
  /** gate_id → fase (readiness_gates.phase_id). */
  gatePhase: ReadonlyMap<string, string | null>
  /** phase_id → ITR de la fase en el proyecto. */
  itrByPhase: ReadonlyMap<string, { approved: number; total: number }>
}): PhaseRow[] {
  const defs = [...(rows[0]?.gates ?? [])].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
  return defs.map(def => {
    let approved = 0, toApprove = 0, toSign = 0, regressed = 0, blocked = 0
    const kinds = new Map<CriterionKind, { label: string | null; systems: number }>()
    let commitment: PhaseRow['commitment'] = null
    for (const r of rows) {
      const g = r.gates.find(x => x.gate_id === def.gate_id)
      if (!g) continue
      const st: GateStatus = g.status
      if (isDone(st)) approved++
      if (st === 'ready' || st === 'ready_with_conditions') toApprove++
      if (st === 'pending_signatures') toSign++
      if (st === 'regressed' || st === 'approved_needs_review') regressed++
      if (!isDone(st)) {
        const date = ctx.commitments.get(`${r.system_id}:${def.gate_id}`)
        if (date && (!commitment || date < commitment.date)) {
          commitment = { system_id: r.system_id, system_code: r.system_code, date, forecast: ctx.forecasts.get(`${r.system_id}:${def.gate_id}`) ?? null, late: date < ctx.today }
        }
      }
      if (nextGate(r.gates)?.gate_id !== def.gate_id) continue
      const state = rowState(r.gates)
      if (state !== 'blocked' && state !== 'regressed') continue
      blocked++
      const b: GateBlocker | null | undefined = g.blocker
      if (b) {
        const k = kinds.get(b.kind) ?? { label: b.label, systems: 0 }
        k.systems++
        kinds.set(b.kind, k)
      }
    }
    const top = [...kinds.entries()].sort((a, b) => b[1].systems - a[1].systems)[0]
    const phase = ctx.gatePhase.get(def.gate_id)
    const itr = phase ? ctx.itrByPhase.get(phase) ?? null : null
    return {
      gate_id: def.gate_id, code: def.code, name: def.name,
      approved, total: rows.length, toApprove, toSign, regressed,
      itr: itr && itr.total > 0 ? itr : null,
      blocked,
      topBlocker: top ? { kind: top[0], label: top[1].label, systems: top[1].systems } : null,
      commitment,
    }
  })
}

/** «Lo que bloquea hoy»: sistemas que no avanzan, por riesgo (la misma orden que Readiness), con su siguiente gate. */
export function blockedToday<T extends MatrixRow>(rows: readonly T[], ctx: { commitment: (s: string, g: string) => string | null; today: string }, limit = 8) {
  return filterMatrix(rows, { blocked: true, sort: 'risk' }, { ...ctx, changedIds: new Set() })
    .slice(0, limit)
    .map(r => ({ row: r, gate: nextGate(r.gates)! }))
}

export type UpcomingItem = { kind: 'commitment' | 'forecast' | 'action' | 'constraint' | 'vendor'; date: string; ref: string; title: string; href: string; late?: boolean }

/** «Próximos 7 días»: compromisos y forecast de gates, acciones, restricciones y actividades de vendor que vencen. */
export function upcomingWindow(items: readonly UpcomingItem[], today: string, days = 7): UpcomingItem[] {
  const end = addDays(today, days)
  return items
    .filter(i => i.date <= end && (i.date >= today || i.kind !== 'forecast'))
    .map(i => ({ ...i, late: i.date < today }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref))
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
