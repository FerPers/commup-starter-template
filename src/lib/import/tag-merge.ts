/**
 * Reimportación de tags sin pérdida de datos (S07, C-16 · decisión D9). Puro: cliente y servidor.
 *
 * Reglas:
 *   - Una columna que no viene en el archivo no se toca; una celda vacía tampoco (para borrar un dato se
 *     edita en la app). Los tags nuevos toman los valores del archivo y, si falta, el default.
 *   - Todas las filas de un lote llevan las MISMAS claves: supabase-js rellena con NULL las claves que le
 *     faltan a una fila y el upsert las pisaría. Para los tags existentes, las claves que el archivo no trae
 *     se completan con el valor actual (se reescriben iguales).
 *   - Mover de subsistema un tag que ya tiene ITR o punch no se hace en la importación (el ITR no se puede
 *     mover y la elegibilidad quedaría partida): se informa y el tag se queda donde está.
 */
import { normalizePidRef, textOrNull } from '@/lib/excel/normalize'
import { isCriticality, suggestCriticality } from '@/lib/tags/criticality'

/** Campos opcionales que puede traer el Excel (claves de TagRow / del mapeo del wizard). */
export const TAG_FIELDS = [
  'description', 'manufacturer', 'model', 'serial_number', 'preservation_required', 'pid_drawing',
  'datasheet_number', 'revision', 'range_min', 'range_max', 'eng_unit', 'junction_box', 'fluid_type',
  'mounting_typical', 'criticality', 'sil_level', 'equipment_type', 'subsystem',
] as const
export type TagField = (typeof TAG_FIELDS)[number]

/** Columna de BD de cada campo simple (equipment_type y subsystem se resuelven aparte). */
const DB_COLUMN: Partial<Record<TagField, string>> = {
  description: 'description', manufacturer: 'manufacturer', model: 'model', serial_number: 'serial_number',
  preservation_required: 'preservation_required', pid_drawing: 'pid_drawing', datasheet_number: 'datasheet_number',
  revision: 'revision', range_min: 'range_min', range_max: 'range_max', eng_unit: 'eng_unit',
  junction_box: 'junction_box', fluid_type: 'fluid_type', mounting_typical: 'mounting_typical',
  criticality: 'criticality', sil_level: 'sil_level',
}

export type TagRowValues = {
  tag_number: string
  description?: string
  manufacturer?: string
  model?: string
  serial_number?: string
  preservation_required?: boolean
  pid_drawing?: string
  datasheet_number?: string
  revision?: string
  range_min?: number
  range_max?: number
  eng_unit?: string
  junction_box?: string
  fluid_type?: string
  mounting_typical?: string
  criticality?: string
  sil_level?: string
}

/** Valor normalizado de una celda; `undefined` = vacía (no se toca). */
export function cellValue(field: TagField, row: TagRowValues): string | number | boolean | undefined {
  switch (field) {
    case 'range_min': case 'range_max': {
      const v = row[field]
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined
    }
    case 'preservation_required': return row.preservation_required
    case 'pid_drawing': return normalizePidRef(row.pid_drawing) ?? undefined
    case 'criticality': return isCriticality(row.criticality) ? row.criticality : undefined
    case 'equipment_type': case 'subsystem': return undefined
    default: return textOrNull(row[field as keyof TagRowValues]) ?? undefined
  }
}

/** Columnas de BD que el lote escribe, además de la identidad. */
export function payloadColumns(present: ReadonlySet<TagField>): string[] {
  const cols = TAG_FIELDS.filter(f => present.has(f) && DB_COLUMN[f]).map(f => DB_COLUMN[f]!)
  // El SIL sugiere criticidad «safety» en los tags nuevos: la clave viaja aunque no venga la columna.
  if (present.has('sil_level') && !cols.includes('criticality')) cols.push('criticality')
  return [...new Set(['description', ...cols, 'equipment_type_id'])]
}

export type ExistingTag = {
  id: string
  subsystem_id: string
  /** Tiene ITR o punch: no se mueve de subsistema por importación. */
  has_work: boolean
  [column: string]: unknown
}

export type TagPlan = {
  payload: Record<string, unknown>
  /** Columnas cuyo valor cambia (solo tags existentes). */
  changes: string[]
  /** Cambio de subsistema pedido por el archivo. `blocked` = tiene ITR o punch, se queda donde está. */
  move: { from: string; to: string; blocked: boolean } | null
}

/**
 * Payload de un tag con claves uniformes (`identity` + `payloadColumns(present)`).
 * `resolved` trae lo que se calcula fuera: subsistema y disciplina del archivo, tipo de equipo detectado.
 */
export function planTag(
  row: TagRowValues,
  present: ReadonlySet<TagField>,
  existing: ExistingTag | null,
  resolved: { projectId: string; subsystemId: string; disciplineId: string; equipmentTypeId: string | null },
): TagPlan {
  const tagNumber = row.tag_number.trim()
  const columns = payloadColumns(present)
  const payload: Record<string, unknown> = { project_id: resolved.projectId, tag_number: tagNumber, discipline_id: resolved.disciplineId }
  const changes: string[] = []
  let move: TagPlan['move'] = null

  if (!existing) {
    payload.subsystem_id = resolved.subsystemId
    for (const col of columns) payload[col] = null
    for (const f of TAG_FIELDS) {
      const col = DB_COLUMN[f]
      if (!col || !present.has(f)) continue
      const v = cellValue(f, row)
      payload[col] = v ?? null
    }
    payload.description = textOrNull(row.description) ?? tagNumber
    if ('preservation_required' in payload && payload.preservation_required === null) payload.preservation_required = false
    if ('criticality' in payload && payload.criticality === null) {
      payload.criticality = suggestCriticality(row.sil_level) ? 'safety' : 'normal'
    }
    payload.equipment_type_id = resolved.equipmentTypeId
    return { payload, changes, move }
  }

  // Existente: arranca de los valores actuales y solo pisa lo que el archivo trae con valor.
  for (const col of columns) payload[col] = existing[col] ?? null
  for (const f of TAG_FIELDS) {
    const col = DB_COLUMN[f]
    if (!col || !present.has(f)) continue
    const v = cellValue(f, row)
    if (v === undefined) continue
    if (!sameValue(existing[col], v)) changes.push(col)
    payload[col] = v
  }
  if (present.has('equipment_type') && resolved.equipmentTypeId && resolved.equipmentTypeId !== existing.equipment_type_id) {
    payload.equipment_type_id = resolved.equipmentTypeId
    changes.push('equipment_type_id')
  }

  payload.subsystem_id = existing.subsystem_id
  if (present.has('subsystem') && resolved.subsystemId !== existing.subsystem_id) {
    move = { from: existing.subsystem_id, to: resolved.subsystemId, blocked: existing.has_work }
    if (!existing.has_work) { payload.subsystem_id = resolved.subsystemId; changes.push('subsystem_id') }
  }
  if (resolved.disciplineId !== existing.discipline_id) changes.push('discipline_id')
  return { payload, changes, move }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof b === 'number') return a !== null && a !== undefined && Number(a) === b
  return (a ?? null) === b
}

/** Campos presentes según las columnas que el wizard encontró en el archivo. */
export function presentFromColumns(found: Iterable<string>): Set<TagField> {
  const map: Record<string, TagField> = {
    description: 'description', manufacturer: 'manufacturer', model: 'model', serial: 'serial_number',
    preservation: 'preservation_required', pid_drawing: 'pid_drawing', datasheet: 'datasheet_number',
    datasheet_rev: 'revision', range_min: 'range_min', range_max: 'range_max', eng_unit: 'eng_unit',
    junction_box: 'junction_box', fluid_type: 'fluid_type', mounting_typical: 'mounting_typical',
    criticality: 'criticality', sil: 'sil_level', equipment_type: 'equipment_type', subsystem_code: 'subsystem',
  }
  const out = new Set<TagField>()
  for (const key of found) if (map[key]) out.add(map[key])
  return out
}
