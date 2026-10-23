// Tipo de ítem `table`: matriz de registro con columnas declaradas en la
// plantilla (options) y filas fijas o variables. La captura se guarda como JSON
// en itr_responses.value_text, igual que `continuity`, y se evalúa en TS y en
// SQL (evaluate_itr_table) con las mismas reglas. Cubre calibración por puntos,
// resistencia de aislamiento por fase, actuación/reposición de interruptores,
// torques, pruebas de presión, etc. Nunca inventa tolerancias: min/max y la
// tolerancia solo existen si la plantilla los declara.
//
// Versión 2 (fase 4 · bloque C del plan readiness, decisiones §10.13–10.16), compatible con la 1:
//   · columna `computed`: desviación observado − referencia (absoluta, % del span o % de la lectura),
//     calculada y no editable, con tolerancia ± opcional;
//   · `result` con `auto_from`: ✓/✗ automático según la tolerancia de una columna calculada;
//   · as found / as left: una columna calculada con pass 'as_found' fuera de tolerancia solo se marca
//     (dato para calidad), la de 'as_left' (o sin pass) rechaza;
//   · `datetime` y criterio de estabilidad (`stability`) para series de lecturas: las últimas N
//     lecturas deben quedar dentro de [min, max] (punto de rocío, O₂, bitácora de prueba).
// Las celdas calculadas/automáticas se recalculan siempre aquí y en SQL: lo que envíe el cliente no cuenta.
//
// Filas `source` (fase 4 · bloque D, sesión 2, decisiones §10.21–10.24): las filas salen de la foto que
// el ITR tomó al generarse (itrs.source_rows): una por señal del lazo (loop check) o una por efecto de
// la causa (prueba C&E). Las columnas `reference` muestran datos de esa foto (señal, cadena, efecto,
// acción esperada) y no se capturan. Ver migración 20261016230000_itr_source_rows.

export type TableColumnType = 'text' | 'number' | 'select' | 'result' | 'computed' | 'datetime' | 'reference'
export type DeviationMode = 'abs' | 'pct_span' | 'pct_reading'
export type TolerancePass = 'as_found' | 'as_left'

export type TableFormula = { observed: string; reference: string; mode: DeviationMode; span: number | null }

export type TableColumn = {
  key: string
  label: string
  type: TableColumnType
  unit: string | null
  options: string[] | null
  min: number | null
  max: number | null
  required: boolean
  /** v2 · computed: cómo se calcula la desviación. */
  formula?: TableFormula
  /** v2 · computed: tolerancia ± (null = solo se informa). */
  tolerance?: number | null
  /** v2 · computed: a qué pasada pertenece (as found solo marca; as left o null rechaza). */
  pass?: TolerancePass | null
  /** v2 · result: se calcula desde esta columna `computed` (con tolerancia). */
  auto_from?: string | null
  /** v2 · reference: dato de la foto que se muestra (ver SOURCE_REFS). */
  ref?: string
}

export type TableRowsSpec =
  | { mode: 'fixed'; labels: string[] }
  | { mode: 'variable'; min: number; max: number; label: string }
  | { mode: 'source'; source: TableSource; label: string }

/** Origen de las filas `source`: señales del lazo o efectos de una causa de la matriz C&E. */
export type TableSource = 'loop_signals' | 'ce_effects'
/** Una fila de la foto del ITR (itrs.source_rows). `key` = id de la señal o del efecto. */
export type SourceRow = { key: string; label: string; refs: Record<string, string | null> }

/** Datos de la foto que puede mostrar una columna `reference`, por origen. Espejo de itr_table_config_valid. */
export const SOURCE_REFS: Record<TableSource, Record<string, string>> = {
  loop_signals: {
    signal_tag: 'Señal', signal_type: 'Tipo', instrument: 'Instrumento', service: 'Servicio', range: 'Rango',
    alarms: 'Alarmas / set points', junction_box: 'JB', marshalling: 'Marshalling', io_card: 'Tarjeta I/O',
    io_channel: 'Canal', dcs_tag: 'Tag DCS', hmi_display: 'HMI',
  },
  ce_effects: {
    effect_code: 'Efecto', effect_description: 'Descripción', effect_tag: 'Elemento final', action: 'Acción esperada', link: 'Cruce',
  },
}
export const TABLE_SOURCE_LABELS: Record<TableSource, string> = { loop_signals: 'Señales del lazo', ce_effects: 'Efectos de la causa (C&E)' }

const ACTION_LABELS: Record<string, string> = { close: 'Cerrar', open: 'Abrir', trip: 'Disparo', start: 'Arrancar', stop: 'Parar', alarm: 'Alarma', other: 'Otra' }

/** Valor legible de un dato de la foto (la acción C&E se guarda como código). */
export function sourceRefText(ref: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return ref === 'action' ? ACTION_LABELS[value] ?? value : value
}

/** Lee itrs.source_rows; null si no hay foto o no tiene la forma esperada. */
export function parseSourceRows(value: unknown): SourceRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: SourceRow[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || typeof (raw as SourceRow).key !== 'string' || typeof (raw as SourceRow).label !== 'string') return null
    const refsRaw = (raw as { refs?: unknown }).refs
    const refs: Record<string, string | null> = {}
    if (refsRaw && typeof refsRaw === 'object' && !Array.isArray(refsRaw)) {
      for (const [k, v] of Object.entries(refsRaw)) refs[k] = typeof v === 'string' ? v : null
    }
    rows.push({ key: (raw as SourceRow).key, label: (raw as SourceRow).label, refs })
  }
  return rows
}

export type TableStability = { column: string; last_n: number; min: number | null; max: number | null }

export type TableConfig = { version: 1 | 2; columns: TableColumn[]; rows: TableRowsSpec; stability?: TableStability | null }

export type TableCellValue = string | number | null
export type TableRow = { id: string; label: string; cells: Record<string, TableCellValue> }
export type TableCapture = { version: 1; count: number; rows: TableRow[] }

export const TABLE_RESULT_VALUES = ['pass', 'fail', 'not_applicable'] as const
const COLUMN_TYPES: readonly TableColumnType[] = ['text', 'number', 'select', 'result', 'computed', 'datetime', 'reference']
const V2_TYPES: readonly TableColumnType[] = ['computed', 'datetime', 'reference']
const MODES: readonly DeviationMode[] = ['abs', 'pct_span', 'pct_reading']
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
export const TABLE_MAX_COLUMNS = 16
export const TABLE_MAX_ROWS = 500
/** Margen numérico al comparar con la tolerancia (SQL usa numeric exacto). */
const EPS = 1e-9

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

type Checked = { config: TableConfig | null; issue: string | null }
const bad = (issue: string): Checked => ({ config: null, issue })

/**
 * Valida y normaliza la configuración guardada en itr_template_items.options. Si no es válida,
 * `issue` explica por qué (para el constructor de plantillas). Espejo de itr_table_config_valid.
 */
export function checkTableConfig(options: unknown): Checked {
  if (!object(options) || (options.version !== 1 && options.version !== 2) || !Array.isArray(options.columns)) return bad('Configuración de tabla inválida')
  const version = options.version as 1 | 2
  if (options.columns.length < 1) return bad('La tabla necesita al menos una columna')
  if (options.columns.length > TABLE_MAX_COLUMNS) return bad(`Máximo ${TABLE_MAX_COLUMNS} columnas`)
  const keys = new Set<string>()
  const columns: TableColumn[] = []
  for (const raw of options.columns) {
    if (!object(raw) || typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key) || keys.has(raw.key)) return bad('Clave de columna inválida o repetida')
    if (!text(raw.label)) return bad('Todas las columnas necesitan etiqueta')
    if (typeof raw.type !== 'string' || !COLUMN_TYPES.includes(raw.type as TableColumnType)) return bad(`Tipo de columna no válido en «${raw.label}»`)
    const type = raw.type as TableColumnType
    if (V2_TYPES.includes(type) && version !== 2) return bad(`«${raw.label}» requiere la versión 2 de la tabla`)
    if ('unit' in raw && raw.unit !== null && raw.unit !== undefined && typeof raw.unit !== 'string') return bad(`Unidad inválida en «${raw.label}»`)
    if ('required' in raw && raw.required !== undefined && typeof raw.required !== 'boolean') return bad(`«Requerido» inválido en «${raw.label}»`)
    let selectOptions: string[] | null = null
    if (type === 'select') {
      if (!Array.isArray(raw.options) || raw.options.length < 1 || !raw.options.every(text)) return bad(`«${raw.label}» necesita opciones`)
      if (new Set(raw.options).size !== raw.options.length) return bad(`Opciones repetidas en «${raw.label}»`)
      selectOptions = raw.options as string[]
    }
    let min: number | null = null
    let max: number | null = null
    if (type === 'number') {
      if ('min' in raw && raw.min !== null && raw.min !== undefined && !finite(raw.min)) return bad(`Mínimo inválido en «${raw.label}»`)
      if ('max' in raw && raw.max !== null && raw.max !== undefined && !finite(raw.max)) return bad(`Máximo inválido en «${raw.label}»`)
      min = finite(raw.min) ? raw.min : null
      max = finite(raw.max) ? raw.max : null
      if (min !== null && max !== null && min > max) return bad(`Mínimo mayor que máximo en «${raw.label}»`)
    }
    keys.add(raw.key)
    const column: TableColumn = {
      key: raw.key, label: raw.label.trim(), type,
      unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null,
      options: selectOptions, min, max,
      required: type === 'computed' || type === 'reference' ? false : typeof raw.required === 'boolean' ? raw.required : true,
    }
    if (type === 'reference') {
      if (typeof raw.ref !== 'string') return bad(`«${raw.label}»: indica qué dato de la foto muestra`)
      column.ref = raw.ref
    }
    if (type === 'computed') {
      const f = raw.formula
      if (!object(f) || typeof f.observed !== 'string' || typeof f.reference !== 'string' || !MODES.includes(f.mode as DeviationMode)) return bad(`Fórmula incompleta en «${raw.label}»`)
      const span = finite(f.span) ? f.span : null
      if (f.mode === 'pct_span' && (span === null || span <= 0)) return bad(`«${raw.label}» necesita el span (> 0) para el % del span`)
      if ('tolerance' in raw && raw.tolerance !== null && raw.tolerance !== undefined && (!finite(raw.tolerance) || raw.tolerance < 0)) return bad(`Tolerancia inválida en «${raw.label}»`)
      if ('pass' in raw && raw.pass !== null && raw.pass !== undefined && raw.pass !== 'as_found' && raw.pass !== 'as_left') return bad(`Pasada inválida en «${raw.label}»`)
      column.formula = { observed: f.observed, reference: f.reference, mode: f.mode as DeviationMode, span: f.mode === 'pct_span' ? span : null }
      column.tolerance = finite(raw.tolerance) ? raw.tolerance : null
      column.pass = raw.pass === 'as_found' || raw.pass === 'as_left' ? raw.pass : null
    }
    if (type === 'result' && 'auto_from' in raw && raw.auto_from !== null && raw.auto_from !== undefined) {
      if (version !== 2) return bad(`El resultado automático de «${raw.label}» requiere la versión 2`)
      if (typeof raw.auto_from !== 'string') return bad(`Resultado automático inválido en «${raw.label}»`)
      column.auto_from = raw.auto_from
      column.required = false
    }
    columns.push(column)
  }
  // Referencias entre columnas (después de conocerlas todas).
  const byKey = new Map(columns.map(c => [c.key, c]))
  for (const c of columns) {
    if (c.type === 'computed') {
      for (const ref of [c.formula!.observed, c.formula!.reference]) {
        if (byKey.get(ref)?.type !== 'number') return bad(`«${c.label}» debe calcularse con columnas numéricas`)
      }
      if (c.formula!.observed === c.formula!.reference) return bad(`«${c.label}»: observado y referencia deben ser columnas distintas`)
    }
    if (c.auto_from) {
      const src = byKey.get(c.auto_from)
      if (src?.type !== 'computed') return bad(`«${c.label}» debe calcularse desde una columna de desviación`)
      if (src.tolerance === null || src.tolerance === undefined) return bad(`Indica la tolerancia de «${src.label}» para el resultado automático`)
      if (src.pass === 'as_found') return bad(`«${c.label}» no puede calcularse desde una columna «as found»`)
    }
  }
  const rowsRaw = options.rows
  if (!object(rowsRaw)) return bad('Filas inválidas')
  let rows: TableRowsSpec
  if (rowsRaw.mode === 'fixed') {
    if (!Array.isArray(rowsRaw.labels) || rowsRaw.labels.length < 1 || rowsRaw.labels.length > 200 || !rowsRaw.labels.every(text)) return bad('Indica entre 1 y 200 etiquetas de fila')
    rows = { mode: 'fixed', labels: rowsRaw.labels.map(label => label.trim()) }
  } else if (rowsRaw.mode === 'variable') {
    if (!Number.isInteger(rowsRaw.min) || !Number.isInteger(rowsRaw.max) || !text(rowsRaw.label)) return bad('Filas variables: nombre, mínimo y máximo enteros')
    const rmin = rowsRaw.min as number, rmax = rowsRaw.max as number
    if (rmin < 1 || rmax > TABLE_MAX_ROWS || rmin > rmax) return bad(`Filas variables: entre 1 y ${TABLE_MAX_ROWS}`)
    rows = { mode: 'variable', min: rmin, max: rmax, label: rowsRaw.label.trim() }
  } else if (rowsRaw.mode === 'source') {
    if (version !== 2) return bad('Las filas desde lazo o matriz C&E requieren la versión 2')
    if (rowsRaw.source !== 'loop_signals' && rowsRaw.source !== 'ce_effects') return bad('Origen de filas no válido')
    if (!text(rowsRaw.label)) return bad('Indica el nombre de la fila (p. ej. «Señal» o «Efecto»)')
    const allowed = SOURCE_REFS[rowsRaw.source]
    const wrong = columns.find(c => c.type === 'reference' && !(c.ref! in allowed))
    if (wrong) return bad(`«${wrong.label}» no es un dato de ${TABLE_SOURCE_LABELS[rowsRaw.source].toLowerCase()}`)
    rows = { mode: 'source', source: rowsRaw.source, label: rowsRaw.label.trim() }
  } else return bad('Filas inválidas')
  if (rows.mode !== 'source' && columns.some(c => c.type === 'reference')) return bad('Las columnas de referencia solo existen en filas desde lazo o matriz C&E')

  const config: TableConfig = { version, columns, rows }
  if ('stability' in options && options.stability !== null && options.stability !== undefined) {
    const s = options.stability
    if (version !== 2) return bad('El criterio de estabilidad requiere la versión 2')
    if (!object(s) || typeof s.column !== 'string' || !Number.isInteger(s.last_n) || (s.last_n as number) < 1 || (s.last_n as number) > TABLE_MAX_ROWS) return bad('Estabilidad: columna y cantidad de lecturas')
    const col = byKey.get(s.column)
    if (col?.type !== 'number' && col?.type !== 'computed') return bad('Estabilidad: la columna debe ser numérica')
    if (rows.mode !== 'variable') return bad('Estabilidad: solo para filas variables (serie de lecturas)')
    const smin = finite(s.min) ? s.min : null, smax = finite(s.max) ? s.max : null
    if ((s.min !== null && s.min !== undefined && smin === null) || (s.max !== null && s.max !== undefined && smax === null)) return bad('Estabilidad: límites inválidos')
    if (smin === null && smax === null) return bad('Estabilidad: indica un mínimo o un máximo')
    if (smin !== null && smax !== null && smin > smax) return bad('Estabilidad: mínimo mayor que máximo')
    config.stability = { column: s.column, last_n: s.last_n as number, min: smin, max: smax }
  }
  return { config, issue: null }
}

export function parseTableConfig(options: unknown): TableConfig | null {
  return checkTableConfig(options).config
}

/** Desviación observado − referencia según el modo; null si falta un dato o no se puede calcular. */
export function deviation(formula: TableFormula, observed: TableCellValue, reference: TableCellValue): number | null {
  if (!finite(observed) || !finite(reference)) return null
  const d = observed - reference
  if (formula.mode === 'abs') return d
  if (formula.mode === 'pct_span') return formula.span ? (d / formula.span) * 100 : null
  return reference === 0 ? null : (d / Math.abs(reference)) * 100
}

const outOfTolerance = (v: number | null, tol: number | null | undefined) => v !== null && tol !== null && tol !== undefined && Math.abs(v) > tol + EPS

/** Filas esperadas (ids R1..Rn) para una configuración y una cantidad declarada (o la foto del ITR). */
export function expectedTableRows(config: TableConfig, count: number, sourceRows?: SourceRow[] | null): Array<{ id: string; label: string }> {
  if (config.rows.mode === 'fixed') return config.rows.labels.map((label, i) => ({ id: `R${i + 1}`, label }))
  if (config.rows.mode === 'source') return (sourceRows ?? []).map((row, i) => ({ id: `R${i + 1}`, label: row.label }))
  if (!Number.isInteger(count) || count < config.rows.min || count > config.rows.max) return []
  const label = config.rows.label
  return Array.from({ length: count }, (_, i) => ({ id: `R${i + 1}`, label: `${label} ${i + 1}` }))
}

/** Captura vacía; conserva las celdas de `previous` cuyo id sigue existiendo. */
export function reshapeTable(config: TableConfig, previous: TableCapture | null, count: number, sourceRows?: SourceRow[] | null): TableCapture {
  const existing = new Map(previous?.rows.map(row => [row.id, row]) ?? [])
  const rows = expectedTableRows(config, count, sourceRows)
  return {
    version: 1,
    count: rows.length,
    rows: rows.map(({ id, label }) => ({
      id, label,
      cells: Object.fromEntries(config.columns.map(column => [column.key, existing.get(id)?.cells[column.key] ?? null])),
    })),
  }
}

export type TableRowFlags = { fail: boolean; asFoundOut: boolean }
export type TableStabilityResult = { ok: boolean | null; needed: number; have: number }

/**
 * V3: lo que falta o está mal en un registro de tabla, como código; el texto sale de `ActionErrors.table.<code>`
 * (TableCapture en el cliente, upsertResponse en el servidor).
 */
type TableRecordIssue = 'invalid_config' | 'pending' | 'invalid_record' | 'no_source_rows' | 'source_count' | 'row_count' | 'rows_mismatch'
export type TableIssue =
  | { code: TableRecordIssue }
  | { code: 'missing'; row: string; column: string }
  | { code: 'na_reason'; row: string }
  | { code: 'stability'; n: number }

export function evaluateTable(options: unknown, value: string | null | undefined, sourceRows?: SourceRow[] | null): {
  isComplete: boolean; hasFail: boolean; errors: TableIssue[]; data: TableCapture | null; config: TableConfig | null
  /** v2: marcas por fila (rechazo / as found fuera de tolerancia) y criterio de estabilidad. */
  rowFlags: Record<string, TableRowFlags>; asFoundOut: number; stability: TableStabilityResult | null
} {
  const config = parseTableConfig(options)
  const base = { rowFlags: {}, asFoundOut: 0, stability: null }
  const invalid = (code: TableRecordIssue = 'invalid_record') => ({ isComplete: false, hasFail: false, errors: [{ code }] as TableIssue[], data: null, config, ...base })
  if (!config) return invalid('invalid_config')
  if (!text(value)) return invalid('pending')
  let d: unknown
  try { d = JSON.parse(value) } catch { return invalid() }
  // jsonb cannot store NUL or unpaired surrogates: reject before submission so
  // the browser and the atomic SQL evaluation agree.
  const pending: unknown[] = [d]
  while (pending.length) {
    const part = pending.pop()
    if (typeof part === 'string' && /[\u0000\uD800-\uDFFF]/u.test(part)) return invalid()
    if (Array.isArray(part)) { for (const entry of part) pending.push(entry) }
    else if (object(part)) { for (const [key, entry] of Object.entries(part)) pending.push(key, entry) }
  }
  if (!object(d) || d.version !== 1 || !Number.isInteger(d.count) || !Array.isArray(d.rows)) return invalid()
  const count = d.count as number
  if (config.rows.mode === 'source') {
    if (!sourceRows?.length) return invalid('no_source_rows')
    if (count !== sourceRows.length) return invalid('source_count')
  } else if (config.rows.mode === 'fixed' ? count !== config.rows.labels.length : count < config.rows.min || count > config.rows.max) return invalid('row_count')
  const expected = expectedTableRows(config, count, sourceRows)
  if (d.rows.length !== expected.length) return invalid('rows_mismatch')
  const errors: TableIssue[] = []
  const rows: TableRow[] = []
  const rowFlags: Record<string, TableRowFlags> = {}
  let hasFail = false
  let asFoundOut = 0
  const series: Array<number | null> = []
  for (let i = 0; i < expected.length; i++) {
    const raw = d.rows[i]
    if (!object(raw) || raw.id !== expected[i].id || !object(raw.cells)) return invalid()
    const cells = raw.cells
    for (const key of Object.keys(cells)) if (!config.columns.some(column => column.key === key)) return invalid()
    const label = expected[i].label
    const out: Record<string, TableCellValue> = {}
    const flags: TableRowFlags = { fail: false, asFoundOut: false }
    let hasText = false
    let notApplicable = false
    // 1) Columnas capturadas por el inspector.
    for (const column of config.columns) {
      const cell = cells[column.key]
      if (column.type === 'reference') {
        // Dato de la foto: lo enviado no cuenta; se muestra el de itrs.source_rows.
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid()
        out[column.key] = sourceRefText(column.ref!, sourceRows?.[i]?.refs[column.ref!])
        continue
      }
      if (column.type === 'computed' || (column.type === 'result' && column.auto_from)) {
        // Valor derivado: se acepta cualquier valor de la forma correcta y se recalcula abajo.
        if (cell !== undefined && cell !== null && typeof cell !== (column.type === 'computed' ? 'number' : 'string')) return invalid()
        continue
      }
      if (column.type === 'text') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid()
        const v = typeof cell === 'string' ? cell : ''
        if (v.trim()) hasText = true
        else if (column.required) errors.push({ code: 'missing', row: label, column: column.label })
        out[column.key] = v
      } else if (column.type === 'datetime') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid()
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push({ code: 'missing', row: label, column: column.label }) }
        else if (!DATETIME_PATTERN.test(v)) return invalid()
        out[column.key] = v
      } else if (column.type === 'number') {
        if (cell !== undefined && cell !== null && typeof cell !== 'number') return invalid()
        const v = finite(cell) ? cell : null
        if (typeof cell === 'number' && !Number.isFinite(cell)) return invalid()
        if (v === null) { if (column.required) errors.push({ code: 'missing', row: label, column: column.label }) }
        else if ((column.min !== null && v < column.min) || (column.max !== null && v > column.max)) { hasFail = true; flags.fail = true }
        out[column.key] = v
      } else if (column.type === 'select') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid()
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push({ code: 'missing', row: label, column: column.label }) }
        else if (!column.options?.includes(v)) return invalid()
        out[column.key] = v
      } else {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid()
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push({ code: 'missing', row: label, column: column.label }) }
        else if (!(TABLE_RESULT_VALUES as readonly string[]).includes(v)) return invalid()
        else if (v === 'fail') { hasFail = true; flags.fail = true }
        else if (v === 'not_applicable') notApplicable = true
        out[column.key] = v
      }
    }
    // 2) Columnas calculadas (desviación + tolerancia) y resultados automáticos. Se evalúa con el valor
    //    exacto (`exact`), como SQL; en la celda queda redondeado a 6 decimales solo para mostrar.
    const exact: Record<string, number | null> = {}
    for (const column of config.columns) {
      if (column.type !== 'computed') continue
      const v = deviation(column.formula!, out[column.formula!.observed], out[column.formula!.reference])
      exact[column.key] = v
      out[column.key] = v === null ? null : Math.round(v * 1e6) / 1e6
      if (outOfTolerance(v, column.tolerance)) {
        if (column.pass === 'as_found') { flags.asFoundOut = true; asFoundOut++ }
        else { hasFail = true; flags.fail = true }
      }
    }
    for (const column of config.columns) {
      if (column.type !== 'result' || !column.auto_from) continue
      const src = config.columns.find(c => c.key === column.auto_from)!
      const v = exact[src.key] ?? null
      out[column.key] = v === null ? '' : outOfTolerance(v, src.tolerance) ? 'fail' : 'pass'
    }
    if (config.stability) {
      const key = config.stability.column
      const v = key in exact ? exact[key] : out[key]
      series.push(finite(v) ? v : null)
    }
    if (notApplicable && !hasText) errors.push({ code: 'na_reason', row: label })
    rows.push({ id: expected[i].id, label, cells: out })
    rowFlags[expected[i].id] = flags
  }
  // 3) Estabilidad: las últimas N lecturas registradas dentro de [min, max].
  let stability: TableStabilityResult | null = null
  if (config.stability) {
    const s = config.stability
    const values = series.filter((v): v is number => v !== null)
    if (values.length < s.last_n) {
      errors.push({ code: 'stability', n: s.last_n })
      stability = { ok: null, needed: s.last_n, have: values.length }
    } else {
      const ok = values.slice(-s.last_n).every(v => (s.min === null || v >= s.min - EPS) && (s.max === null || v <= s.max + EPS))
      if (!ok) hasFail = true
      stability = { ok, needed: s.last_n, have: values.length }
    }
  }
  return { isComplete: errors.length === 0, hasFail, errors, data: { version: 1, count, rows }, config, rowFlags, asFoundOut, stability }
}

const col = (c: Partial<TableColumn> & Pick<TableColumn, 'key' | 'label' | 'type'>): TableColumn =>
  ({ unit: null, options: null, min: null, max: null, required: true, ...c })

/** Presets de tablas industriales frecuentes. Sin tolerancias: min/max y tolerancia quedan para la plantilla. */
export const TABLE_PRESETS: ReadonlyArray<{ id: string; label: string; config: TableConfig }> = [
  {
    id: 'calibration', label: 'Calibración por puntos (5 puntos ↑↓)',
    config: { version: 1, rows: { mode: 'fixed', labels: ['0 %', '25 %', '50 %', '75 %', '100 %', '75 %', '50 %', '25 %', '0 %'] }, columns: [
      { key: 'input', label: 'Entrada aplicada', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'expected', label: 'Salida esperada', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'observed', label: 'Salida observada', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'error', label: 'Error', type: 'number', unit: '%', options: null, min: null, max: null, required: true },
      { key: 'result', label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true },
      { key: 'remarks', label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false },
    ] },
  },
  {
    id: 'insulation', label: 'Resistencia de aislamiento (fase–tierra, fase–fase)',
    config: { version: 1, rows: { mode: 'fixed', labels: ['L1–T', 'L2–T', 'L3–T', 'L1–L2', 'L2–L3', 'L1–L3'] }, columns: [
      { key: 'test_voltage', label: 'Tensión de prueba', type: 'number', unit: 'V', options: null, min: null, max: null, required: true },
      { key: 'reading', label: 'Lectura', type: 'number', unit: 'MΩ', options: null, min: null, max: null, required: true },
      { key: 'duration', label: 'Tiempo', type: 'number', unit: 's', options: null, min: null, max: null, required: false },
      { key: 'result', label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true },
      { key: 'remarks', label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false },
    ] },
  },
  {
    id: 'switch', label: 'Interruptor: actuación y reposición por ciclo',
    config: { version: 1, rows: { mode: 'variable', min: 1, max: 20, label: 'Ciclo' }, columns: [
      { key: 'direction', label: 'Sentido', type: 'select', unit: null, options: ['Ascendente', 'Descendente'], min: null, max: null, required: true },
      { key: 'spec', label: 'Especificado', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'observed', label: 'Observado', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'contact', label: 'Estado de contacto', type: 'select', unit: null, options: ['Abre', 'Cierra'], min: null, max: null, required: true },
      { key: 'result', label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true },
      { key: 'remarks', label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false },
    ] },
  },
  {
    id: 'spec_vs_measured', label: 'Especificado vs. medido (torque, alineación, holgura)',
    config: { version: 1, rows: { mode: 'variable', min: 1, max: 100, label: 'Punto' }, columns: [
      { key: 'element', label: 'Elemento', type: 'text', unit: null, options: null, min: null, max: null, required: true },
      { key: 'spec', label: 'Especificado', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'measured', label: 'Medido', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'result', label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true },
      { key: 'remarks', label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false },
    ] },
  },
  {
    id: 'pressure', label: 'Prueba de presión / fuga',
    config: { version: 1, rows: { mode: 'variable', min: 1, max: 10, label: 'Tramo' }, columns: [
      { key: 'medium', label: 'Medio', type: 'text', unit: null, options: null, min: null, max: null, required: true },
      { key: 'pressure', label: 'Presión de prueba', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'duration', label: 'Duración', type: 'number', unit: 'min', options: null, min: null, max: null, required: true },
      { key: 'drop', label: 'Caída', type: 'number', unit: null, options: null, min: null, max: null, required: true },
      { key: 'result', label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true },
      { key: 'remarks', label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false },
    ] },
  },
  // ── v2 (fase 4-C): cálculo y resultado automáticos. Span, tolerancia y límites de estabilidad los
  //    define el autor de la plantilla: hasta entonces checkTableConfig explica qué falta.
  {
    id: 'calibration_auto', label: 'Calibración por puntos con error y resultado automáticos',
    config: { version: 2, rows: { mode: 'fixed', labels: ['0 %', '25 %', '50 %', '75 %', '100 %', '75 %', '50 %', '25 %', '0 %'] }, columns: [
      col({ key: 'input', label: 'Entrada aplicada', type: 'number' }),
      col({ key: 'expected', label: 'Salida esperada', type: 'number' }),
      col({ key: 'observed', label: 'Salida observada', type: 'number' }),
      col({ key: 'error', label: 'Error', type: 'computed', unit: '% span', required: false, formula: { observed: 'observed', reference: 'expected', mode: 'pct_span', span: null }, tolerance: null, pass: null }),
      col({ key: 'result', label: 'Resultado', type: 'result', required: false, auto_from: 'error' }),
      col({ key: 'remarks', label: 'Observación', type: 'text', required: false }),
    ] },
  },
  {
    id: 'as_found_left', label: 'Calibración as found / as left (13.8)',
    config: { version: 2, rows: { mode: 'fixed', labels: ['0 %', '25 %', '50 %', '75 %', '100 %'] }, columns: [
      col({ key: 'input', label: 'Entrada aplicada', type: 'number' }),
      col({ key: 'expected', label: 'Salida esperada', type: 'number' }),
      col({ key: 'found', label: 'As found', type: 'number' }),
      col({ key: 'found_error', label: 'Error as found', type: 'computed', unit: '% span', required: false, formula: { observed: 'found', reference: 'expected', mode: 'pct_span', span: null }, tolerance: null, pass: 'as_found' }),
      col({ key: 'left', label: 'As left', type: 'number' }),
      col({ key: 'left_error', label: 'Error as left', type: 'computed', unit: '% span', required: false, formula: { observed: 'left', reference: 'expected', mode: 'pct_span', span: null }, tolerance: null, pass: 'as_left' }),
      col({ key: 'result', label: 'Resultado', type: 'result', required: false, auto_from: 'left_error' }),
      col({ key: 'remarks', label: 'Observación', type: 'text', required: false }),
    ] },
  },
  {
    id: 'reading_series', label: 'Serie de lecturas con estabilidad (punto de rocío, O₂, bitácora)',
    config: { version: 2, rows: { mode: 'variable', min: 1, max: 200, label: 'Lectura' }, stability: { column: 'value', last_n: 3, min: null, max: null }, columns: [
      col({ key: 'at', label: 'Fecha y hora', type: 'datetime' }),
      col({ key: 'point', label: 'Punto de muestreo', type: 'text', required: false }),
      col({ key: 'value', label: 'Lectura', type: 'number', unit: '°C' }),
      col({ key: 'remarks', label: 'Observación', type: 'text', required: false }),
    ] },
  },
  // ── Filas desde la foto del ITR (fase 4-D): loop check por lazo y prueba por causa C&E.
  {
    id: 'loop_check', label: 'Loop check: una fila por señal del lazo con su cadena',
    config: { version: 2, rows: { mode: 'source', source: 'loop_signals', label: 'Señal' }, columns: [
      col({ key: 'signal_type', label: 'Tipo', type: 'reference', required: false, ref: 'signal_type' }),
      col({ key: 'range', label: 'Rango', type: 'reference', required: false, ref: 'range' }),
      col({ key: 'junction_box', label: 'JB', type: 'reference', required: false, ref: 'junction_box' }),
      col({ key: 'marshalling', label: 'Marshalling', type: 'reference', required: false, ref: 'marshalling' }),
      col({ key: 'io', label: 'Tarjeta I/O', type: 'reference', required: false, ref: 'io_card' }),
      col({ key: 'channel', label: 'Canal', type: 'reference', required: false, ref: 'io_channel' }),
      col({ key: 'dcs_tag', label: 'Tag DCS', type: 'reference', required: false, ref: 'dcs_tag' }),
      col({ key: 'hmi', label: 'HMI', type: 'reference', required: false, ref: 'hmi_display' }),
      col({ key: 'wiring', label: 'Cableado, continuidad y polaridad', type: 'result' }),
      col({ key: 'injected', label: 'Valor aplicado', type: 'number', required: false }),
      col({ key: 'read', label: 'Lectura en DCS', type: 'number', required: false }),
      col({ key: 'hmi_ok', label: 'Indicación HMI y alarmas', type: 'result' }),
      col({ key: 'result', label: 'Resultado', type: 'result' }),
      col({ key: 'remarks', label: 'Observación', type: 'text', required: false }),
    ] },
  },
  {
    id: 'ce_test', label: 'Prueba C&E: una fila por efecto de la causa',
    config: { version: 2, rows: { mode: 'source', source: 'ce_effects', label: 'Efecto' }, columns: [
      col({ key: 'description', label: 'Descripción', type: 'reference', required: false, ref: 'effect_description' }),
      col({ key: 'action', label: 'Acción esperada', type: 'reference', required: false, ref: 'action' }),
      col({ key: 'link', label: 'Cruce', type: 'reference', required: false, ref: 'link' }),
      col({ key: 'executed', label: 'Ejecutó la acción', type: 'select', options: ['Sí', 'No'] }),
      col({ key: 'response_s', label: 'Tiempo de respuesta', type: 'number', unit: 's', required: false }),
      col({ key: 'feedback', label: 'Confirmación (feedback) en DCS', type: 'result' }),
      col({ key: 'result', label: 'Resultado', type: 'result' }),
      col({ key: 'remarks', label: 'Observación', type: 'text', required: false }),
    ] },
  },
]
