export interface ContinuityRow {
  id: string; from: string; to: string
  result: '' | 'pass' | 'fail' | 'not_applicable'
  remarks: string; reading: number | null; unit: string
}
export interface ContinuityCapture {
  version: 1; grouping: 'pairs' | 'conductors'; count: number
  shields: string[]; measurementRequired: boolean; rows: ContinuityRow[]
}
/**
 * A38: alcance fijado por un líder y congelado en el ITR (`itr_continuity_scopes`, única escritura
 * `set_itr_continuity_scope`). La captura debe cubrirlo exactamente; sin alcance no hay continuidad completa.
 */
export interface ContinuityScope {
  grouping: ContinuityCapture['grouping']; count: number; shields: string[]
  setBy?: string | null; setAt?: string | null; reason?: string | null
}
export function expectedContinuityIds(grouping: ContinuityCapture['grouping'], count: number, shields: string[]): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 500) return []
  return Array.from({ length: count }, (_, i) => grouping === 'pairs' ? [`P${i + 1}-A`, `P${i + 1}-B`] : [`C${i + 1}`]).flat().concat(shields.map(s => `S:${s}`))
}
/** Opciones de un ítem de continuidad en la plantilla (null = lectura opcional). */
export type ContinuityOptions = { measurement_required: true }
/** A38 (38-3): la lectura obligatoria la fija la plantilla (`options.measurement_required`), no el ejecutor. */
export function continuityMeasurementRequired(options: unknown): boolean {
  return !!options && typeof options === 'object' && !Array.isArray(options) && (options as Record<string, unknown>).measurement_required === true
}
/** Misma agrupación, cantidad y conjunto de pantallas (= evaluate_itr_continuity). */
export function coversScope(capture: Pick<ContinuityCapture, 'grouping' | 'count' | 'shields'>, scope: Pick<ContinuityScope, 'grouping' | 'count' | 'shields'>): boolean {
  const a = [...capture.shields].sort(), b = [...scope.shields].sort()
  return capture.grouping === scope.grouping && capture.count === scope.count && a.length === b.length && a.every((s, i) => s === b[i])
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export type ContinuityEvaluation = { isComplete: boolean; hasFail: boolean; errors: string[]; data: ContinuityCapture | null; scopeMissing: boolean; scopeMismatch: boolean }
export function evaluateContinuity(value: string | null | undefined, scope: ContinuityScope | null, measurementRequired: boolean): ContinuityEvaluation {
  const invalid = () => ({ isComplete: false, hasFail: false, errors: ['Estructura de continuidad inválida'], data: null, scopeMissing: false, scopeMismatch: false })
  let d: unknown
  try { d = JSON.parse(value ?? '') } catch { return invalid() }
  // jsonb cannot represent NUL or unpaired UTF-16 surrogates. Reject these
  // before submission so the browser and atomic database evaluation agree.
  const pending: unknown[] = [d]
  while (pending.length) {
    const part = pending.pop()
    if (typeof part === 'string' && /[\u0000\uD800-\uDFFF]/u.test(part)) return invalid()
    if (Array.isArray(part)) { for (const entry of part) pending.push(entry) }
    else if (object(part)) { for (const [key, entry] of Object.entries(part)) pending.push(key, entry) }
  }
  if (!object(d) || d.version !== 1 || (d.grouping !== 'pairs' && d.grouping !== 'conductors') || typeof d.count !== 'number' || !Number.isInteger(d.count) || d.count < 1 || d.count > 500 || !Array.isArray(d.shields) || !d.shields.every(text) || new Set(d.shields).size !== d.shields.length || typeof d.measurementRequired !== 'boolean' || !Array.isArray(d.rows)) return invalid()
  const expected = new Set(expectedContinuityIds(d.grouping, d.count, d.shields))
  const seen = new Set<string>(); const errors: string[] = []; const rows: ContinuityRow[] = []; let hasFail = false
  const scopeMissing = scope === null
  const scopeMismatch = !scopeMissing && !coversScope({ grouping: d.grouping, count: d.count, shields: d.shields as string[] }, scope)
  if (scopeMissing) errors.push('Falta el alcance fijado por un líder')
  if (scopeMismatch) errors.push('La captura no cubre el alcance fijado')
  for (const r of d.rows) {
    if (!object(r) || typeof r.id !== 'string' || !expected.has(r.id) || seen.has(r.id)) return invalid()
    seen.add(r.id)
    const result = r.result === 'pass' || r.result === 'fail' || r.result === 'not_applicable' ? r.result : ''
    if (!text(r.from) || !text(r.to) || !result) errors.push(`${r.id}: faltan terminales o resultado`)
    if (result === 'fail') hasFail = true
    if (result === 'not_applicable' && !text(r.remarks)) errors.push(`${r.id}: justifique No aplica`)
    if (result !== 'not_applicable' && measurementRequired && (typeof r.reading !== 'number' || !Number.isFinite(r.reading) || !text(r.unit))) errors.push(`${r.id}: falta lectura válida y unidad`)
    rows.push({ id: r.id, from: typeof r.from === 'string' ? r.from : '', to: typeof r.to === 'string' ? r.to : '', result, remarks: typeof r.remarks === 'string' ? r.remarks : '', reading: typeof r.reading === 'number' && Number.isFinite(r.reading) ? r.reading : null, unit: typeof r.unit === 'string' ? r.unit : '' })
  }
  if (seen.size !== expected.size) errors.push('Faltan conductores o pantallas')
  return { isComplete: errors.length === 0, hasFail, errors, data: { version: 1, grouping: d.grouping, count: d.count, shields: d.shields, measurementRequired: d.measurementRequired, rows }, scopeMissing, scopeMismatch }
}
/** Fila de `itr_continuity_scopes` → alcance (null si falta o no es válida). */
export function continuityScopeFromRow(row: { grouping_mode: string; quantity: number; shields: string[] | null; set_by?: string | null; set_at?: string | null; reason?: string | null } | null | undefined): ContinuityScope | null {
  if (!row || (row.grouping_mode !== 'pairs' && row.grouping_mode !== 'conductors')) return null
  return { grouping: row.grouping_mode, count: row.quantity, shields: row.shields ?? [], setBy: row.set_by ?? null, setAt: row.set_at ?? null, reason: row.reason ?? null }
}
