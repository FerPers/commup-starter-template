// A37 (decisión de Luis 2026-10-24): la tolerancia de una calibración la escribe el inspector de instrumentación en el
// ITR (valor y base del error) y él califica cada fila. El formato NO calcula resultados ni bloquea la firma: solo
// AVISA cuando lo escrito no cuadra con las lecturas, para que el inspector lo corrija y el supervisor lo vea.
//   · error_mismatch: el error escrito no coincide con observado − esperado en la base que eligió el inspector
//     (diagnóstico ITR H2: «esperado 12, observado 99, error 0, conforme»);
//   · pass_out_of_tolerance: una fila «conforme» cuyo error supera la tolerancia que el mismo inspector escribió;
//   · notas de la tabla: falta el criterio, falta el span, o hay as found «no conforme» sin ajuste posterior.
// Sin SQL: nada de esto decide completitud ni aceptación (evaluate_itr_capture no lo usa).
import { evaluateTable, type DeviationMode, type TableAdvisory } from './table'

export type AdvisoryItem = { id: string; item_number?: string | null; item_type: string; options?: unknown }
export type AdvisoryAnswer = { value_text?: string | null; value_numeric?: number | null; value_option?: string | null } | null | undefined
export type AdvisoryIssue =
  | { code: 'error_mismatch'; row: string; written: number; computed: number }
  | { code: 'pass_out_of_tolerance'; row: string; error: number; tolerance: number }
export type AdvisoryNote = { code: 'no_criterion' } | { code: 'no_span' } | { code: 'as_found_no_adjust'; count: number }
export type TableAdvisoryResult = { rows: Record<string, AdvisoryIssue[]>; notes: AdvisoryNote[]; count: number }

const EPS = 1e-9
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Desviación en la base elegida; null si no se puede calcular (sin span, lectura de referencia 0). */
export function advisoryDeviation(mode: DeviationMode, observed: number, expected: number, span: number | null): number | null {
  const d = observed - expected
  if (mode === 'abs') return d
  if (mode === 'pct_span') return span !== null && span > 0 ? (d / span) * 100 : null
  return expected !== 0 ? (d / expected) * 100 : null
}

/** Margen de redondeo: media unidad del último decimal que escribió el inspector (0,4 cubre 0,375). */
function roundingMargin(written: number): number {
  const s = String(written)
  if (/e/i.test(s)) return EPS
  const decimals = s.includes('.') ? s.split('.')[1].length : 0
  return 0.5 * 10 ** -decimals + EPS
}

/** Avisos por ítem de tabla con `advisory`, para los ítems aplicables. Clave = id del ítem. */
export function calibrationAdvisories(
  items: readonly AdvisoryItem[],
  answerOf: (itemId: string) => AdvisoryAnswer,
  applicable: ReadonlySet<string> | null = null,
): Record<string, TableAdvisoryResult> {
  const byNumber = new Map(items.filter(i => i.item_number && (!applicable || applicable.has(i.id))).map(i => [i.item_number!.trim(), i]))
  const numberOf = (ref: string): number | null => { const it = byNumber.get(ref); const v = it ? answerOf(it.id)?.value_numeric : null; return finite(v) ? v : null }
  const optionOf = (ref: string): string | null => { const it = byNumber.get(ref); return it ? answerOf(it.id)?.value_option ?? null : null }
  const out: Record<string, TableAdvisoryResult> = {}
  for (const item of items) {
    if (item.item_type !== 'table' || (applicable && !applicable.has(item.id))) continue
    const evaluated = evaluateTable(item.options, answerOf(item.id)?.value_text ?? null)
    const a: TableAdvisory | null | undefined = evaluated.config?.advisory
    if (!a || !evaluated.data) continue
    const result: TableAdvisoryResult = { rows: {}, notes: [], count: 0 }
    const tolerance = numberOf(a.tolerance_item)
    const baseOption = optionOf(a.base_item)
    const mode = baseOption ? a.base_modes[baseOption] ?? null : null
    const lo = a.span_items ? numberOf(a.span_items[0]) : null, hi = a.span_items ? numberOf(a.span_items[1]) : null
    const span = lo !== null && hi !== null ? Math.abs(hi - lo) : null
    const captured = evaluated.data.rows.filter(row => finite(row.cells[a.expected]) && finite(row.cells[a.observed]))
    if (captured.length && (tolerance === null || mode === null)) result.notes.push({ code: 'no_criterion' })
    if (captured.length && mode === 'pct_span' && !(span !== null && span > 0)) result.notes.push({ code: 'no_span' })
    for (const row of evaluated.data.rows) {
      const issues: AdvisoryIssue[] = []
      const expected = row.cells[a.expected], observed = row.cells[a.observed]
      const written = a.error ? row.cells[a.error] : null
      const computed = mode && finite(expected) && finite(observed) ? advisoryDeviation(mode, observed, expected, span) : null
      if (computed !== null && finite(written)) {
        const margin = roundingMargin(written)
        if (Math.abs(written - computed) > margin && Math.abs(Math.abs(written) - Math.abs(computed)) > margin) {
          issues.push({ code: 'error_mismatch', row: row.label, written, computed: Math.round(computed * 1e4) / 1e4 })
        }
      }
      const error = computed ?? (finite(written) ? written : null)
      if (row.cells[a.result] === 'pass' && tolerance !== null && error !== null && Math.abs(error) > Math.abs(tolerance) + EPS) {
        issues.push({ code: 'pass_out_of_tolerance', row: row.label, error: Math.round(error * 1e4) / 1e4, tolerance })
      }
      if (issues.length) { result.rows[row.id] = issues; result.count += issues.length }
    }
    // Solo cuando el inspector ya respondió que no ajustó (mientras no responde, no hay nada que avisar).
    const adjusted = a.adjust ? optionOf(a.adjust.item) : null
    if (a.adjust && evaluated.asFoundOut > 0 && adjusted !== null && adjusted !== a.adjust.value) {
      result.notes.push({ code: 'as_found_no_adjust', count: evaluated.asFoundOut })
    }
    result.count += result.notes.length
    if (result.count) out[item.id] = result
  }
  return out
}
