// Equipos de prueba calibrados (fase 4 · bloque B, decisiones §10.3 y §10.9–10.12 del plan readiness).
// La validez se mide contra la FECHA DE USO en el ITR (13.42). Espejo puro de
// itr_test_equipment_blocker (migración 20261016150000): mantener en sincronía.

export const TEST_EQUIPMENT_KINDS = [
  'insulation_tester', 'loop_calibrator', 'pressure_gauge', 'deadweight_tester', 'multimeter',
  'clamp_meter', 'earth_tester', 'relay_tester', 'torque_wrench', 'thermometer', 'flow_meter', 'other',
] as const
export type TestEquipmentKind = typeof TEST_EQUIPMENT_KINDS[number]

/** Días antes del vencimiento en que se avisa «por vencer». */
export const EXPIRING_DAYS = 30

export type CalibrationState = 'valid' | 'expiring' | 'expired' | 'not_yet'

const day = (iso: string) => iso.slice(0, 10)

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${day(toIso)}T00:00:00Z`) - Date.parse(`${day(fromIso)}T00:00:00Z`)) / 86_400_000)
}

/** Estado de la calibración en una fecha (YYYY-MM-DD). */
export function calibrationState(eq: { calibrated_on: string; calibration_due: string }, onDate: string): CalibrationState {
  const d = day(onDate)
  if (d < day(eq.calibrated_on)) return 'not_yet'
  if (d > day(eq.calibration_due)) return 'expired'
  return daysBetween(d, eq.calibration_due) <= EXPIRING_DAYS ? 'expiring' : 'valid'
}

/** ¿Sirve para firmar? (vigente en la fecha de uso, «por vencer» incluido) */
export const isUsable = (s: CalibrationState) => s === 'valid' || s === 'expiring'

export type EquipmentUse = { code: string; used_on: string; calibrated_on: string; calibration_due: string }

/** Motivo por el que el ITR no se puede firmar por sus equipos, o null (igual que la función SQL). */
export function equipmentSignBlocker(uses: EquipmentUse[], templateRequires: boolean): { kind: 'expired'; codes: string[] } | { kind: 'missing' } | null {
  const expired = uses.filter(u => !isUsable(calibrationState(u, u.used_on))).map(u => u.code)
  if (expired.length) return { kind: 'expired', codes: expired }
  if (templateRequires && uses.length === 0) return { kind: 'missing' }
  return null
}
