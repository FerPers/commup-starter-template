/**
 * Planificación por readiness (fase 5 del plan readiness, sesión 2 — 2026-10-16).
 *
 * Lógica pura del look-ahead 90/30/7 y de los pesos de gate. La BD (migración 20261017150000) calcula el
 * avance ponderado (`compute_system_progress`); aquí solo se arma y ordena lo que se muestra.
 * Tests en planning.test.ts.
 */

// S23 (D-26): también la ventana diaria (reunión de la mañana).
export const LOOKAHEAD_WINDOWS = [1, 7, 30, 90] as const
export type LookaheadWindow = (typeof LOOKAHEAD_WINDOWS)[number]

export type LookaheadKind = 'gate' | 'action' | 'constraint' | 'tq' | 'work_plan'

export type LookaheadItem = {
  kind: LookaheadKind
  id: string
  /** Número o código visible (ACC-0001, RES-0003, MC…). */
  ref: string
  title: string
  systemId: string | null
  systemCode: string | null
  /** Fecha que cae en la ventana (YYYY-MM-DD). */
  date: string
  /** Solo gates: qué fecha es la que cae en la ventana. */
  basis?: 'forecast' | 'commitment'
  status: string
  href: string
  /** Solo gates: forecast − compromiso en días (positivo = el forecast va detrás). */
  gapDays?: number | null
  /** Solo gates: vence en la ventana y no está listo ni aprobado. */
  atRisk?: boolean
  /** S23 (D-26): por qué no avanza (primer criterio que falla del gate). */
  detail?: string | null
}

/** Diferencia en días entre dos fechas ISO (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Forecast − compromiso (días). null si falta alguna. Positivo = atraso contra lo comprometido. */
export function gateGap(forecast: string | null | undefined, commitment: string | null | undefined): number | null {
  if (!forecast || !commitment) return null
  return diffDays(commitment, forecast)
}

/** Estados del motor de gates que ya no representan riesgo de fecha. */
const SETTLED = new Set(['approved', 'approved_with_conditions', 'approved_needs_review', 'pending_signatures'])
const READY = new Set(['ready', 'ready_with_conditions'])

/** Un gate está en riesgo si su fecha cae en la ventana (o ya pasó) y no está listo ni aprobado. */
export function gateAtRisk(status: string, date: string, windowEnd: string): boolean {
  if (SETTLED.has(status) || READY.has(status)) return false
  return date <= windowEnd
}

/** Fecha dentro de [desde, hasta]; las vencidas (antes de hoy) también entran: siguen pendientes. */
export function inWindow(date: string | null | undefined, windowEnd: string): date is string {
  return !!date && date <= windowEnd
}

/** Orden: por fecha, luego gates primero (son el hito), luego por referencia. */
const KIND_RANK: Record<LookaheadKind, number> = { gate: 0, constraint: 1, action: 2, tq: 3, work_plan: 4 }
export function sortLookahead(items: LookaheadItem[]): LookaheadItem[] {
  return [...items].sort((a, b) =>
    a.date.localeCompare(b.date) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.ref.localeCompare(b.ref))
}

/** Agrupa por sistema (los sin sistema al final), manteniendo el orden de cada grupo. */
export function groupBySystem(items: LookaheadItem[]): { systemId: string | null; systemCode: string | null; items: LookaheadItem[] }[] {
  const groups = new Map<string, { systemId: string | null; systemCode: string | null; items: LookaheadItem[] }>()
  for (const it of sortLookahead(items)) {
    const key = it.systemId ?? ''
    if (!groups.has(key)) groups.set(key, { systemId: it.systemId, systemCode: it.systemCode, items: [] })
    groups.get(key)!.items.push(it)
  }
  return [...groups.values()].sort((a, b) =>
    (a.systemCode === null ? 1 : 0) - (b.systemCode === null ? 1 : 0) || (a.systemCode ?? '').localeCompare(b.systemCode ?? ''))
}

/** Pesos normalizados como en SQL: NULL = 1; si todos suman 0, todos 0. */
export function normalizeWeights(weights: (number | null)[]): number[] {
  const w = weights.map(x => (x ?? 1))
  const total = w.reduce((s, x) => s + x, 0)
  return w.map(x => (total > 0 ? x / total : 0))
}

/** Sistema con su avance por gate (de `system_progress_snapshots.per_gate`, mismos pesos que el avance real). */
export type PlanSystem = { systemId: string; itrTotal: number; gates: { gateId: string; weight: number; itrTotal: number }[] }
export type GateCommitment = { systemId: string; gateId: string; date: string }

/**
 * S10 (D-27): línea base de la curva S a partir de los compromisos por gate. Supone que en la fecha
 * comprometida el gate completa sus ITR (aporte = peso del gate) y la pondera igual que
 * compute_system_progress / compute_project_progress: Σ peso × avance por sistema, y el proyecto ponderado
 * por cantidad de ITR. Un gate sin ITR no aporta (tampoco al avance real). Devuelve un valor 0–1 por fecha.
 */
export function plannedCurve(systems: PlanSystem[], commitments: GateCommitment[], dates: string[]): number[] {
  const due = new Map(commitments.map(c => [`${c.systemId}:${c.gateId}`, c.date]))
  const total = systems.reduce((s, x) => s + x.itrTotal, 0)
  if (total <= 0) return dates.map(() => 0)
  return dates.map(d => {
    let sum = 0
    for (const s of systems) {
      if (s.itrTotal <= 0) continue
      const pct = s.gates.reduce((acc, g) => {
        const when = due.get(`${s.systemId}:${g.gateId}`)
        return acc + (g.itrTotal > 0 && when && when <= d ? g.weight : 0)
      }, 0)
      sum += pct * s.itrTotal
    }
    return Math.round((sum / total) * 10000) / 10000
  })
}
