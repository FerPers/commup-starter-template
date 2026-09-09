// Tipo de ítem `table`: matriz de registro con columnas declaradas en la
// plantilla (options) y filas fijas o variables. La captura se guarda como JSON
// en itr_responses.value_text, igual que `continuity`, y se evalúa en TS y en
// SQL (evaluate_itr_table) con las mismas reglas. Cubre calibración por puntos,
// resistencia de aislamiento por fase, actuación/reposición de interruptores,
// torques, pruebas de presión, etc. Nunca inventa tolerancias: min/max solo
// existen si la plantilla los declara.

export type TableColumnType = 'text' | 'number' | 'select' | 'result'

export type TableColumn = {
  key: string
  label: string
  type: TableColumnType
  unit: string | null
  options: string[] | null
  min: number | null
  max: number | null
  required: boolean
}

export type TableRowsSpec =
  | { mode: 'fixed'; labels: string[] }
  | { mode: 'variable'; min: number; max: number; label: string }

export type TableConfig = { version: 1; columns: TableColumn[]; rows: TableRowsSpec }

export type TableCellValue = string | number | null
export type TableRow = { id: string; label: string; cells: Record<string, TableCellValue> }
export type TableCapture = { version: 1; count: number; rows: TableRow[] }

export const TABLE_RESULT_VALUES = ['pass', 'fail', 'not_applicable'] as const
const COLUMN_TYPES: readonly TableColumnType[] = ['text', 'number', 'select', 'result']
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
export const TABLE_MAX_COLUMNS = 12
export const TABLE_MAX_ROWS = 500

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Valida y normaliza la configuración guardada en itr_template_items.options. */
export function parseTableConfig(options: unknown): TableConfig | null {
  if (!object(options) || options.version !== 1 || !Array.isArray(options.columns)) return null
  if (options.columns.length < 1 || options.columns.length > TABLE_MAX_COLUMNS) return null
  const keys = new Set<string>()
  const columns: TableColumn[] = []
  for (const raw of options.columns) {
    if (!object(raw) || typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key) || keys.has(raw.key)) return null
    if (!text(raw.label) || typeof raw.type !== 'string' || !COLUMN_TYPES.includes(raw.type as TableColumnType)) return null
    if ('unit' in raw && raw.unit !== null && raw.unit !== undefined && typeof raw.unit !== 'string') return null
    if ('required' in raw && raw.required !== undefined && typeof raw.required !== 'boolean') return null
    const type = raw.type as TableColumnType
    let selectOptions: string[] | null = null
    if (type === 'select') {
      if (!Array.isArray(raw.options) || raw.options.length < 1 || !raw.options.every(text)) return null
      if (new Set(raw.options).size !== raw.options.length) return null
      selectOptions = raw.options as string[]
    }
    let min: number | null = null
    let max: number | null = null
    if (type === 'number') {
      if ('min' in raw && raw.min !== null && raw.min !== undefined && !finite(raw.min)) return null
      if ('max' in raw && raw.max !== null && raw.max !== undefined && !finite(raw.max)) return null
      min = finite(raw.min) ? raw.min : null
      max = finite(raw.max) ? raw.max : null
      if (min !== null && max !== null && min > max) return null
    }
    keys.add(raw.key)
    columns.push({
      key: raw.key, label: raw.label.trim(), type,
      unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null,
      options: selectOptions, min, max,
      required: typeof raw.required === 'boolean' ? raw.required : true,
    })
  }
  const rows = options.rows
  if (!object(rows)) return null
  if (rows.mode === 'fixed') {
    if (!Array.isArray(rows.labels) || rows.labels.length < 1 || rows.labels.length > 200 || !rows.labels.every(text)) return null
    return { version: 1, columns, rows: { mode: 'fixed', labels: rows.labels.map(label => label.trim()) } }
  }
  if (rows.mode === 'variable') {
    if (!Number.isInteger(rows.min) || !Number.isInteger(rows.max) || !text(rows.label)) return null
    const min = rows.min as number, max = rows.max as number
    if (min < 1 || max > TABLE_MAX_ROWS || min > max) return null
    return { version: 1, columns, rows: { mode: 'variable', min, max, label: rows.label.trim() } }
  }
  return null
}

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

export function evaluateTable(options: unknown, value: string | null | undefined): {
  isComplete: boolean; hasFail: boolean; errors: string[]; data: TableCapture | null; config: TableConfig | null
} {
  const config = parseTableConfig(options)
  const invalid = (message: string) => ({ isComplete: false, hasFail: false, errors: [message], data: null, config })
  if (!config) return invalid('Configuración de tabla inválida')
  if (!text(value)) return { isComplete: false, hasFail: false, errors: ['Registro pendiente'], data: null, config }
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
  let hasFail = false
  for (let i = 0; i < expected.length; i++) {
    const raw = d.rows[i]
    if (!object(raw) || raw.id !== expected[i].id || !object(raw.cells)) return invalid('Registro de tabla inválido')
    const cells = raw.cells
    for (const key of Object.keys(cells)) if (!config.columns.some(column => column.key === key)) return invalid('Registro de tabla inválido')
    const label = expected[i].label
    const out: Record<string, TableCellValue> = {}
    let hasText = false
    let notApplicable = false
    for (const column of config.columns) {
      const cell = cells[column.key]
      if (column.type === 'text') {
        if (cell !== undefined && cell !== null && typeof cell !== 'string') return invalid('Registro de tabla inválido')
        const v = typeof cell === 'string' ? cell : ''
        if (v.trim()) hasText = true
        else if (column.required) errors.push(`${label}: falta ${column.label}`)
        out[column.key] = v
      } else if (column.type === 'number') {
        if (cell !== undefined && cell !== null && typeof cell !== 'number') return invalid('Registro de tabla inválido')
        const v = finite(cell) ? cell : null
        if (typeof cell === 'number' && !Number.isFinite(cell)) return invalid('Registro de tabla inválido')
        if (v === null) { if (column.required) errors.push(`${label}: falta ${column.label}`) }
        else {
          if (column.min !== null && v < column.min) hasFail = true
          if (column.max !== null && v > column.max) hasFail = true
        }
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
        else if (v === 'fail') hasFail = true
        else if (v === 'not_applicable') notApplicable = true
        out[column.key] = v
      }
    }
    if (notApplicable && !hasText) errors.push(`${label}: justifique No aplica`)
    rows.push({ id: expected[i].id, label, cells: out })
  }
  return { isComplete: errors.length === 0, hasFail, errors, data: { version: 1, count, rows }, config }
}

/** Presets de tablas industriales frecuentes. Sin tolerancias: min/max quedan en null. */
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
]
