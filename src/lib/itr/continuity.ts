export interface ContinuityRow {
  id: string; from: string; to: string
  result: '' | 'pass' | 'fail' | 'not_applicable'
  remarks: string; reading: number | null; unit: string
}
export interface ContinuityCapture {
  version: 1; grouping: 'pairs' | 'conductors'; count: number
  shields: string[]; measurementRequired: boolean; rows: ContinuityRow[]
}
export function expectedContinuityIds(grouping: ContinuityCapture['grouping'], count: number, shields: string[]): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 500) return []
  return Array.from({ length: count }, (_, i) => grouping === 'pairs' ? [`P${i + 1}-A`, `P${i + 1}-B`] : [`C${i + 1}`]).flat().concat(shields.map(s => `S:${s}`))
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export function evaluateContinuity(value: string | null | undefined): { isComplete: boolean; hasFail: boolean; errors: string[]; data: ContinuityCapture | null } {
  const invalid = () => ({ isComplete: false, hasFail: false, errors: ['Estructura de continuidad inválida'], data: null })
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
  for (const r of d.rows) {
    if (!object(r) || typeof r.id !== 'string' || !expected.has(r.id) || seen.has(r.id)) return invalid()
    seen.add(r.id)
    const result = r.result === 'pass' || r.result === 'fail' || r.result === 'not_applicable' ? r.result : ''
    if (!text(r.from) || !text(r.to) || !result) errors.push(`${r.id}: faltan terminales o resultado`)
    if (result === 'fail') hasFail = true
    if (result === 'not_applicable' && !text(r.remarks)) errors.push(`${r.id}: justifique No aplica`)
    if (result !== 'not_applicable' && d.measurementRequired && (typeof r.reading !== 'number' || !Number.isFinite(r.reading) || !text(r.unit))) errors.push(`${r.id}: falta lectura válida y unidad`)
    rows.push({ id: r.id, from: typeof r.from === 'string' ? r.from : '', to: typeof r.to === 'string' ? r.to : '', result, remarks: typeof r.remarks === 'string' ? r.remarks : '', reading: typeof r.reading === 'number' && Number.isFinite(r.reading) ? r.reading : null, unit: typeof r.unit === 'string' ? r.unit : '' })
  }
  if (seen.size !== expected.size) errors.push('Faltan conductores o pantallas')
  return { isComplete: errors.length === 0, hasFail, errors, data: { version: 1, grouping: d.grouping, count: d.count, shields: d.shields, measurementRequired: d.measurementRequired, rows } }
}
