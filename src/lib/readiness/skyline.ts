/**
 * E1 (plan referente, maquetas M aprobadas por Luis 2026-10-22): skyline de liberación.
 *
 * Una caja por sistema en la fecha de COMPROMISO de la liberación elegida (si solo hay pronóstico, esa fecha y
 * borde punteado; sin fecha, a la bandeja «Sin fecha»). Color por avance de esa liberación (ITR aprobados de su
 * fase, `compute_project_gate_progress`): aprobada · ≥ 50 % · < 50 %. Vencida = fecha pasada y sin aprobar.
 * Columnas por semana (2 atrás, 9 adelante) o por mes. Lógica pura; tests en skyline.test.ts.
 */
import type { GateStatus } from './gates'
import { isDone } from './matrix'
import { addDays } from './planning'

export type SkylineScale = 'week' | 'month'
export const SKYLINE_SCALES: readonly SkylineScale[] = ['week', 'month']

/** Columnas por escala y cuántas quedan antes de la de hoy (2 semanas atrás + hoy + 9 adelante). */
const SHAPE: Record<SkylineScale, { count: number; back: number }> = {
  week: { count: 12, back: 2 },
  month: { count: 6, back: 1 },
}

export type SkylineColumn = { start: string; end: string; isCurrent: boolean }

export type SkylineTone = 'approved' | 'mid' | 'low'

export type SkylineSystem = {
  systemId: string
  systemCode: string
  systemName: string
  areaCode: string
  status: GateStatus
  commitment: string | null
  forecast: string | null
  /** Avance de la liberación, 0–1. */
  pct: number
  itrTotal: number
}

export type SkylineBox = SkylineSystem & {
  date: string
  basis: 'commitment' | 'forecast'
  tone: SkylineTone
  overdue: boolean
}

export type Skyline = {
  columns: SkylineColumn[]
  /** Cajas por columna (mismo índice que `columns`), por fecha y código. */
  stacks: SkylineBox[][]
  /** Con fecha fuera del rango a la vista. */
  before: SkylineBox[]
  after: SkylineBox[]
  undated: SkylineSystem[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isIso = (s: string | undefined): s is string => !!s && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** Lunes de la semana de una fecha ISO. */
export function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0 = domingo
  return addDays(iso, -((day + 6) % 7))
}

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`

export function addMonths(iso: string, n: number): string {
  const d = new Date(`${monthStart(iso)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Primer día de la primera columna: el `from` de la URL o el rango por defecto alrededor de hoy. */
export function rangeStart(today: string, scale: SkylineScale, from?: string | null): string {
  const { back } = SHAPE[scale]
  if (scale === 'week') return from ? weekStart(from) : addDays(weekStart(today), -7 * back)
  return from ? monthStart(from) : addMonths(today, -back)
}

export function buildColumns(today: string, scale: SkylineScale, from?: string | null): SkylineColumn[] {
  const start = rangeStart(today, scale, from)
  return Array.from({ length: SHAPE[scale].count }, (_, i) => {
    const s = scale === 'week' ? addDays(start, 7 * i) : addMonths(start, i)
    const e = scale === 'week' ? addDays(s, 6) : addDays(addMonths(s, 1), -1)
    return { start: s, end: e, isCurrent: s <= today && today <= e }
  })
}

/** `from` para las flechas ‹ ›: se corre un tercio del rango (4 semanas o 2 meses). */
export function shiftFrom(today: string, scale: SkylineScale, from: string | null | undefined, dir: -1 | 1): string {
  const start = rangeStart(today, scale, from)
  return scale === 'week' ? addDays(start, 28 * dir) : addMonths(start, 2 * dir)
}

export function skylineTone(status: GateStatus, pct: number): SkylineTone {
  if (isDone(status)) return 'approved'
  return pct >= 0.5 ? 'mid' : 'low'
}

export function buildSkyline(systems: SkylineSystem[], today: string, scale: SkylineScale, from?: string | null): Skyline {
  const columns = buildColumns(today, scale, from)
  const stacks: SkylineBox[][] = columns.map(() => [])
  const before: SkylineBox[] = []
  const after: SkylineBox[] = []
  const undated: SkylineSystem[] = []
  const first = columns[0].start
  const last = columns[columns.length - 1].end

  for (const s of systems) {
    const date = s.commitment ?? s.forecast
    if (!date) { undated.push(s); continue }
    const tone = skylineTone(s.status, s.pct)
    const box: SkylineBox = { ...s, date, basis: s.commitment ? 'commitment' : 'forecast', tone, overdue: tone !== 'approved' && date < today }
    if (date < first) before.push(box)
    else if (date > last) after.push(box)
    else stacks[columns.findIndex(c => c.start <= date && date <= c.end)].push(box)
  }
  const byDate = (a: SkylineBox, b: SkylineBox) => a.date.localeCompare(b.date) || a.systemCode.localeCompare(b.systemCode)
  stacks.forEach(st => st.sort(byDate))
  before.sort(byDate)
  after.sort(byDate)
  undated.sort((a, b) => a.systemCode.localeCompare(b.systemCode))
  return { columns, stacks, before, after, undated }
}

/** Liberación por defecto: la primera (en orden) que algún sistema no tiene aprobada; si todas lo están, la última. */
export function defaultSkylineGate(gates: { gateId: string; order: number; statuses: GateStatus[] }[]): string | null {
  const sorted = [...gates].sort((a, b) => a.order - b.order)
  return (sorted.find(g => g.statuses.some(s => !isDone(s))) ?? sorted[sorted.length - 1])?.gateId ?? null
}

export type SkylineParams = { gate?: string; scale: SkylineScale; from?: string }

/** Parámetros de la URL (`?gate=&scale=&from=`); lo desconocido se ignora. */
export function parseSkylineParams(sp: Record<string, string | undefined>): SkylineParams {
  return {
    gate: sp.gate?.trim() ? sp.gate.trim() : undefined,
    scale: sp.scale === 'month' ? 'month' : 'week',
    from: isIso(sp.from) ? sp.from : undefined,
  }
}

/** Query string de la vista (sin los valores por defecto), para enlaces y el Excel. */
export function skylineQuery(p: SkylineParams): string {
  const q = new URLSearchParams()
  if (p.gate) q.set('gate', p.gate)
  if (p.scale !== 'week') q.set('scale', p.scale)
  if (p.from) q.set('from', p.from)
  const s = q.toString()
  return s ? `?${s}` : ''
}
