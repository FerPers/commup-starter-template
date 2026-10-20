/**
 * Reimportación de señales sin borrar la cadena del loop check (S07, F-06 · decisión D9). Puro.
 * Mismas reglas que tag-merge: columna ausente o celda vacía = no se toca; claves uniformes por lote
 * (las existentes se completan con su valor actual); el lazo solo cambia si el archivo trae la columna
 * LAZO con valor (un índice «puro» de instrumentación ya no desvincula las señales de sus lazos).
 */
import { normalizePidRef, textOrNull } from '@/lib/excel/normalize'

/** Columna del wizard (SIGNAL_COLS) → columna de BD. */
const SIGNAL_DB: Record<string, string> = {
  description: 'description', service: 'service', range_min: 'range_min', range_max: 'range_max', eng_unit: 'eng_unit',
  alarms: 'alarm_setpoints', origin: 'origin', destination: 'destination', pid: 'pid_drawing',
  loop_diagram: 'loop_diagram', wiring_diagram: 'wiring_diagram', notes: 'notes', junction_box: 'junction_box',
  marshalling: 'marshalling', io_card: 'io_card', io_channel: 'io_channel', dcs_tag: 'dcs_tag', hmi_display: 'hmi_display',
}
/** Clave en SignalRow de cada columna del wizard. */
const ROW_KEY: Record<string, string> = { alarms: 'alarm_setpoints', pid: 'pid_drawing' }

export type SignalRowValues = Record<string, unknown> & { signal_tag: string }

export function signalPayloadColumns(present: ReadonlySet<string>): string[] {
  const cols = Object.keys(SIGNAL_DB).filter(k => present.has(k)).map(k => SIGNAL_DB[k])
  if (present.has('loop_number')) cols.push('loop_id')
  return cols
}

function value(key: string, row: SignalRowValues): unknown {
  const raw = row[ROW_KEY[key] ?? key]
  if (key === 'range_min' || key === 'range_max') return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
  if (key === 'pid') return normalizePidRef(raw) ?? undefined
  return textOrNull(raw) ?? undefined
}

export type SignalPlan = { payload: Record<string, unknown>; changes: string[] }

export function planSignal(
  row: SignalRowValues,
  present: ReadonlySet<string>,
  existing: Record<string, unknown> | null,
  resolved: { tagId: string; signalType: string; loopId: string | null },
): SignalPlan {
  const payload: Record<string, unknown> = { tag_id: resolved.tagId, signal_tag: row.signal_tag.trim(), signal_type: resolved.signalType }
  const changes: string[] = []
  for (const col of signalPayloadColumns(present)) payload[col] = existing ? existing[col] ?? null : null
  for (const key of Object.keys(SIGNAL_DB)) {
    if (!present.has(key)) continue
    const v = value(key, row)
    if (v === undefined) continue
    const col = SIGNAL_DB[key]
    if (existing && !same(existing[col], v)) changes.push(col)
    payload[col] = v
  }
  if (present.has('loop_number') && resolved.loopId) {
    if (existing && existing.loop_id !== resolved.loopId) changes.push('loop_id')
    payload.loop_id = resolved.loopId
  }
  if (existing && existing.signal_type !== resolved.signalType) changes.push('signal_type')
  return { payload, changes }
}

function same(a: unknown, b: unknown): boolean {
  if (typeof b === 'number') return a !== null && a !== undefined && Number(a) === b
  return (a ?? null) === b
}
