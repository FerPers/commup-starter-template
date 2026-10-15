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

export type TableColumnType = 'text' | 'number' | 'select' | 'result' | 'computed' | 'datetime'
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
}

export type TableRowsSpec =
  | { mode: 'fixed'; labels: string[] }
  | { mode: 'variable'; min: number; max: number; label: string }

export type TableStability = { column: string; last_n: number; min: number | null; max: number | null }

export type TableConfig = { version: 1 | 2; columns: TableColumn[]; rows: TableRowsSpec; stability?: TableStability | null }

export type TableCellValue = string | number | null
export type TableRow = { id: string; label: string; cells: Record<string, TableCellValue> }
export type TableCapture = { version: 1; count: number; rows: TableRow[] }

export const TABLE_RESULT_VALUES = ['pass', 'fail', 'not_applicable'] as const
const COLUMN_TYPES: readonly TableColumnType[] = ['text', 'number', 'select', 'result', 'computed', 'datetime']
const V2_TYPES: readonly TableColumnType[] = ['computed', 'datetime']
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
      required: type === 'computed' ? false : typeof raw.required === 'boolean' ? raw.required : true,
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
  } else return bad('Filas inválidas')

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

/** Filas esperadas (ids R1..Rn) para una configuración y una cantidad declarada. */
export function expectedTableRows(config: TableConfig, count: number): Array<{ id: string; label: string }> {
  if (config.rows.mode === 'fixed') return config.rows.labels.map((label, i) => ({ id: `R${i + 1}`, label }))
  if (!Number.isInteger(count) || count < config.rows.min || count > config.rows.max) return []
  const label = config.rows.label
  return Array.from({ length: count }, (_, i) => ({ id: `R${i + 1}`, label: `${label} ${i + 1}` }))
}

/** Captura vacía; conserva las celdas de `previous` cuyo id sigue existiendo. */
export function reshapeTable(config: TableConfig, previous: TableCapture | null, count: number): TableCapture {
  const existing = new Map(previous?.rows.map(row => [row.id, row]) ?? [])
  const rows = expectedTableRows(config, count)
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

export function evaluateTable(options: unknown, value: string | null | undefined): {
  isComplete: boolean; hasFail: boolean; errors: string[]; data: TableCapture | null; config: TableConfig | null
  /** v2: marcas por fila (rechazo / as found fuera de tolerancia) y criterio de estabilidad. */
  rowFlags: Record<string, TableRowFlags>; asFoundOut: number; stability: TableStabilityResult | null
} {
  const config = parseTableConfig(options)
  const base = { rowFlags: {}, asFoundOut: 0, stability: null }
  const invalid = (message: string) => ({ isComplete: false, hasFail: false, errors: [message], data: null, config, ...base })
  if (!config) return invalid('Configuración de tabla inválida')
  if (!text(value)) return { isComplete: false, hasFail: false, errors: ['Registro pendiente'], data: null, config, ...base }
  let d: unknown
  try { d = JSON.parse(value) } catch { return invalid('Registro de tabla inválido') }
  // jsonb cannot store NUL or unpaired surrogates: reject before submission so
  // the browser and the atomic SQL evaluation agree.
  const pending: unknown[] = [d]
  while (pending.length) {
    const part = pending.pop()
    if (typeof part === 'string' && /[\u0000\uD800-\uDFFF]/u.test(part)) return invalid('Registro de tabla inválido')
    if (Array.isArray(part)) { for (const entry of part) pending.push(entry) }
    else if (object(part)) { for (const [key, entry] of Object.entries(part)) pending.push(key, entry) }
  }
  if (!object(d) || d.version !== 1 || !Number.isInteger(d.count) || !Array.isArray(d.rows)) return invalid('Registro de tabla inválido')
  const count = d.count as number
  if (config.rows.mode === 'fixed' ? count !== config.rows.labels.length : count < config.rows.min || count > config.rows.max) return invalid('Cantidad de filas fuera de la configuración')
  const expected = expectedTableRows(config, count)
  if (d.rows.length !== expected.length) return invalid('Faltan o sobran filas')
  const errors: string[] = []
  const rows: TableRow[] = []
  const rowFlags: Record<string, TableRowFlags> = {}
  let hasFail = false
  let asFoundOut = 0
  const series: Array<number | null> = []
  for (let i = 0; i < expected.length; i++) {
    const raw = d.rows[i]
    if (!object(raw) || raw.id !== expected[i].id || !object(raw.cells)) return invalid('Registro de tabla inválido')
    const cells = raw.cells
    for (const key of Object.keys(cells)) if (!config.columns.some(column => column.key === key)) return invalid('Registro de tabla inválido')
    const label = expected[i].label
    const out: Record<string, TableCellValue> = {}
    const flags: TableRowFlags = { fail: false, asFoundOut: false }
    let hasText = false
    let notApplicable = false
    // 1) Columnas capturadas por el inspector.
    for (const column of config.columns) {
      const cell = cells[column.key]
      if (column.type === 'computed' || (column.type === 'result' && column.auto_from)) {
        // Valor derivado: se acepta cualquier valor de la forma correcta y se recalcula abajo.
        if (cell !== undefined && cell !== null && typeof cell !== (column.type === 'computed' ? 'number' : 'string')) return invalid('Registro de tabla inválido')
        continue
      }
      if (column.type === 'text') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid('Registro de tabla inválido')
        const v = typeof cell === 'string' ? cell : ''
        if (v.trim()) hasText = true
        else if (column.required) errors.push(`${label}: falta ${column.label}`)
        out[column.key] = v
      } else if (column.type === 'datetime') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid('Registro de tabla inválido')
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push(`${label}: falta ${column.label}`) }
        else if (!DATETIME_PATTERN.test(v)) return invalid('Registro de tabla inválido')
        out[column.key] = v
      } else if (column.type === 'number') {
        if (cell !== undefined && cell !== null && typeof cell !== 'number') return invalid('Registro de tabla inválido')
        const v = finite(cell) ? cell : null
        if (typeof cell === 'number' && !Number.isFinite(cell)) return invalid('Registro de tabla inválido')
        if (v === null) { if (column.required) errors.push(`${label}: falta ${column.label}`) }
        else if ((column.min !== null && v < column.min) || (column.max !== null && v > column.max)) { hasFail = true; flags.fail = true }
        out[column.key] = v
      } else if (column.type === 'select') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid('Registro de tabla inválido')
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push(`${label}: falta ${column.label}`) }
        else if (!column.options?.includes(v)) return invalid('Registro de tabla inválido')
        out[column.key] = v
      } else {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid('Registro de tabla inválido')
        const v = typeof cell === 'string' ? cell : ''
        if (v === '') { if (column.required) errors.push(`${label}: falta ${column.label}`) }
        else if (!(TABLE_RESULT_VALUES as readonly string[]).includes(v)) return invalid('Registro de tabla inválido')
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
    if (notApplicable && !hasText) errors.push(`${label}: justifique No aplica`)
    rows.push({ id: expected[i].id, label, cells: out })
    rowFlags[expected[i].id] = flags
  }
  // 3) Estabilidad: las últimas N lecturas registradas dentro de [min, max].
  let stability: TableStabilityResult | null = null
  if (config.stability) {
    const s = config.stability
    const values = series.filter((v): v is number => v !== null)
    if (values.length < s.last_n) {
      errors.push(`Se requieren al menos ${s.last_n} lecturas para el criterio de estabilidad`)
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
]
