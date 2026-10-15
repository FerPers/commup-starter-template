/**
 * Registros controlados de estado temporal (fase 3 del plan readiness, 2026-10-15).
 *
 * Catálogo FIJO de tipos (decisión de Luis): campos y etiquetas viven aquí; la org activa/desactiva
 * tipos y ajusta qué gate bloquea cada uno (`register_types` en BD, migración 20261015200000).
 * Prefijos y bloqueo por defecto se repiten en SQL (`ensure_register_types`): mantener en sincronía.
 *
 * Ciclo común en BD: proposed → authorized → active → removed → verified (+ cancelled). Cada tipo
 * solo cambia la ETIQUETA de los estados (una ciega «instalada/retirada», un bypass «activo/restaurado»).
 */

export type RegisterKind = 'temporary' | 'blind' | 'reinstatement' | 'bypass' | 'energization' | 'test_pack'
export type RegisterStatus = 'proposed' | 'authorized' | 'active' | 'removed' | 'verified' | 'cancelled'

export const REGISTER_STATUSES: RegisterStatus[] = ['proposed', 'authorized', 'active', 'removed', 'verified', 'cancelled']
export const OPEN_STATUSES: RegisterStatus[] = ['proposed', 'authorized', 'active', 'removed']

/** Transiciones válidas (la RPC `transition_register_item` aplica las mismas). */
export const NEXT_STATUS: Partial<Record<RegisterStatus, RegisterStatus>> = {
  proposed: 'authorized',
  authorized: 'active',
  active: 'removed',
  removed: 'verified',
}

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

export type RegisterField = {
  key: string
  type: FieldType
  /** Opciones de un select (claves; la etiqueta sale de i18n Registers.option.<field>.<opción>). */
  options?: string[]
  unit?: string
  /** Estado al que no se puede pasar sin este campo (ej. el resultado de la prueba al pasar a «activo»). */
  requiredFor?: RegisterStatus
}

export type DefaultGatePosition = 'first' | 'penultimate' | 'last' | null

export type RegisterTypeDef = {
  kind: RegisterKind
  prefix: string
  /** Qué gate bloquea por defecto, por posición (las orgs usan códigos distintos). */
  defaultBlocks: DefaultGatePosition
  /** Rol de los tags vinculados (para test packs: líneas y manómetros). */
  tagRoles: ('subject' | 'line' | 'gauge')[]
  fields: RegisterField[]
}

export const REGISTER_CATALOG: RegisterTypeDef[] = [
  {
    kind: 'temporary', prefix: 'TMP', defaultBlocks: 'penultimate', tagRoles: ['subject'],
    fields: [
      { key: 'category', type: 'select', options: ['hose', 'spool', 'strainer', 'temp_power', 'software', 'other'], requiredFor: 'authorized' },
      { key: 'location', type: 'text', requiredFor: 'authorized' },
      { key: 'purpose', type: 'textarea', requiredFor: 'authorized' },
      { key: 'planned_removal', type: 'date' },
      { key: 'risk', type: 'textarea' },
    ],
  },
  {
    kind: 'blind', prefix: 'CIE', defaultBlocks: 'penultimate', tagRoles: ['subject'],
    fields: [
      { key: 'blind_type', type: 'select', options: ['blind_flange', 'spade', 'spectacle', 'other'], requiredFor: 'authorized' },
      { key: 'size', type: 'text', requiredFor: 'authorized' },
      { key: 'rating', type: 'text' },
      { key: 'location', type: 'text', requiredFor: 'authorized' },
      { key: 'purpose', type: 'select', options: ['pressure_test', 'isolation', 'cleaning', 'other'], requiredFor: 'authorized' },
      { key: 'label_number', type: 'text', requiredFor: 'active' },
    ],
  },
  {
    kind: 'reinstatement', prefix: 'REI', defaultBlocks: 'last', tagRoles: ['subject'],
    fields: [
      { key: 'temporary_condition', type: 'textarea', requiredFor: 'authorized' },
      { key: 'final_condition', type: 'textarea', requiredFor: 'authorized' },
      { key: 'reference', type: 'text' },
    ],
  },
  {
    kind: 'bypass', prefix: 'BYP', defaultBlocks: 'last', tagRoles: ['subject'],
    fields: [
      { key: 'protection_function', type: 'text', requiredFor: 'authorized' },
      { key: 'method', type: 'select', options: ['logic_force', 'jumper', 'inhibit', 'bypass_key', 'other'], requiredFor: 'authorized' },
      { key: 'reason', type: 'textarea', requiredFor: 'authorized' },
      { key: 'risk_mitigation', type: 'textarea', requiredFor: 'authorized' },
      { key: 'max_duration_hours', type: 'number', unit: 'h' },
      { key: 'restoration_check', type: 'textarea', requiredFor: 'verified' },
    ],
  },
  {
    kind: 'energization', prefix: 'ENE', defaultBlocks: null, tagRoles: ['subject'],
    fields: [
      { key: 'equipment', type: 'text', requiredFor: 'authorized' },
      { key: 'boundary', type: 'textarea', requiredFor: 'authorized' },
      { key: 'authority', type: 'text', requiredFor: 'authorized' },
      { key: 'certificate', type: 'text', requiredFor: 'active' },
      { key: 'energized_on', type: 'date', requiredFor: 'active' },
    ],
  },
  {
    kind: 'test_pack', prefix: 'TPK', defaultBlocks: 'first', tagRoles: ['line', 'gauge'],
    fields: [
      { key: 'test_type', type: 'select', options: ['hydrostatic', 'pneumatic', 'service'], requiredFor: 'authorized' },
      { key: 'medium', type: 'select', options: ['water', 'air', 'nitrogen', 'other'], requiredFor: 'authorized' },
      { key: 'design_pressure', type: 'number', unit: 'barg' },
      { key: 'test_pressure', type: 'number', unit: 'barg', requiredFor: 'authorized' },
      { key: 'hold_minutes', type: 'number', unit: 'min', requiredFor: 'authorized' },
      { key: 'boundary', type: 'textarea' },
      { key: 'achieved_pressure', type: 'number', unit: 'barg', requiredFor: 'active' },
      { key: 'result', type: 'select', options: ['accepted', 'rejected'], requiredFor: 'active' },
      { key: 'witness', type: 'text', requiredFor: 'active' },
    ],
  },
]

export const REGISTER_KINDS = REGISTER_CATALOG.map(t => t.kind)
export const registerType = (kind: RegisterKind) => REGISTER_CATALOG.find(t => t.kind === kind)!

/** Datos del formulario → objeto limpio: solo claves del tipo, números válidos, textos recortados. */
export function cleanRegisterData(kind: RegisterKind, input: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of registerType(kind).fields) {
    const v = input[f.key]
    if (v === undefined || v === null || v === '') continue
    if (f.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
      if (Number.isFinite(n)) out[f.key] = n
    } else if (f.type === 'select') {
      if (typeof v === 'string' && f.options?.includes(v)) out[f.key] = v
    } else if (f.type === 'date') {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[f.key] = v
    } else if (typeof v === 'string' && v.trim()) {
      out[f.key] = v.trim().slice(0, f.type === 'textarea' ? 2000 : 300)
    }
  }
  return out
}

/** Campos que faltan para pasar a `to` (todos los requeridos hasta ese estado, inclusive). */
export function missingFieldsFor(kind: RegisterKind, to: RegisterStatus, data: Record<string, unknown>): string[] {
  const order: RegisterStatus[] = ['authorized', 'active', 'removed', 'verified']
  const reach = order.indexOf(to)
  if (reach < 0) return []
  return registerType(kind).fields
    .filter(f => f.requiredFor && order.indexOf(f.requiredFor) <= reach)
    .filter(f => data[f.key] === undefined || data[f.key] === null || data[f.key] === '')
    .map(f => f.key)
}

/** Un test pack rechazado no puede verificarse: hay que repetir la prueba (nuevo ciclo o nuevo pack). */
export function transitionBlockedReason(kind: RegisterKind, to: RegisterStatus, data: Record<string, unknown>): 'test_rejected' | null {
  if (kind === 'test_pack' && (to === 'removed' || to === 'verified') && data.result === 'rejected') return 'test_rejected'
  return null
}
