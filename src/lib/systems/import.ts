import type * as XLSX from 'xlsx'
import { cellText, detectHeaderRow, pickBestSheet, sheetToRows, type ColumnKeywords } from '@/lib/excel/detect-header'
import { normalizeCode } from '@/lib/excel/normalize'
import { cleanBatteryLimits, type BatteryLimits, type DependencyKind, type SystemType } from './dependencies'

// ── Importación Excel de sistematización (fase 2) ────────────────────────────
// Dos hojas: «Sistemas» (atributos de sistemas YA existentes, por código) y
// «Dependencias» (sistema → depende de, tipo y gates opcionales). Los sistemas se
// crean con el importador de jerarquía; aquí solo se completan y se relacionan.
// Puro: recibe filas (`sheet_to_json` con header: 1) y devuelve filas limpias + errores.

export const SYSTEM_COLS: ColumnKeywords = {
  system_code: ['SISTEMA', 'CODIGO SISTEMA', 'SYSTEM', 'SYSTEM CODE'],
  name: ['NOMBRE', 'DESCRIPCION', 'NAME', 'DESCRIPTION'],
  system_type: ['TIPO', 'TIPO SISTEMA', 'TYPE', 'SYSTEM TYPE'],
  priority: ['PRIORIDAD', 'PRIORITY'],
  inlet: ['ENTRADA', 'LIMITE ENTRADA', 'INLET'],
  outlet: ['SALIDA', 'LIMITE SALIDA', 'OUTLET'],
  electrical: ['ELECTRICO', 'INTERFAZ ELECTRICA', 'ELECTRICAL'],
  instrumentation: ['INSTRUMENTACION', 'INSTRUMENTATION', 'CONTROL'],
  utilities: ['UTILITIES', 'SERVICIOS'],
  notes: ['NOTAS', 'OBSERVACIONES', 'NOTES', 'REMARKS'],
}

export const DEPENDENCY_COLS: ColumnKeywords = {
  system_code: ['SISTEMA', 'SISTEMA DEPENDIENTE', 'SYSTEM', 'DEPENDENT SYSTEM'],
  depends_on: ['DEPENDE DE', 'PROVEEDOR', 'DEPENDS ON', 'PROVIDER'],
  kind: ['TIPO DEPENDENCIA', 'TIPO', 'KIND', 'DEPENDENCY TYPE', 'TYPE'],
  required_gate: ['GATE REQUERIDO', 'GATE PROVEEDOR', 'REQUIRED GATE'],
  blocked_gate: ['GATE BLOQUEADO', 'GATE DEPENDIENTE', 'BLOCKED GATE'],
  notes: ['NOTAS', 'OBSERVACIONES', 'NOTES', 'REMARKS'],
}

export type SystemImportRow = {
  row: number
  system_code: string
  name: string | null
  system_type: SystemType | null
  priority: number | null
  battery_limits: BatteryLimits
}

export type DependencyImportRow = {
  row: number
  system_code: string
  depends_on_code: string
  kind: DependencyKind
  required_gate_code: string | null
  blocked_gate_code: string | null
  notes: string | null
}

export type ParseResult<T> = { rows: T[]; errors: string[]; missingColumns: string[] }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** «Proceso», «utility», «Servicio auxiliar», «Seguridad», «safety»… → tipo; '' → null; otro → undefined (error). */
export function parseSystemType(value: string): SystemType | null | undefined {
  const v = strip(value)
  if (!v) return null
  if (v.startsWith('proces')) return 'process'
  if (v.startsWith('util') || v.startsWith('servicio')) return 'utility'
  if (v.startsWith('segur') || v.startsWith('safety')) return 'safety'
  return undefined
}

/** «P1», «1», «p 3» → 1..5; '' → null; fuera de rango → undefined (error). */
export function parsePriority(value: string): number | null | undefined {
  const v = value.trim().toUpperCase().replace(/^P\s*/, '')
  if (!v) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined
}

/** Tipo de dependencia; vacío = utility (lo más común: aire, potencia, N₂…). */
export function parseDependencyKind(value: string): DependencyKind | undefined {
  const v = strip(value)
  if (!v || v.startsWith('util') || v.startsWith('servicio')) return 'utility'
  if (v.startsWith('proces') || v.startsWith('aguas arriba') || v.startsWith('upstream')) return 'process'
  if (v.startsWith('otr') || v.startsWith('other')) return 'other'
  return undefined
}

export function parseSystemsSheet(rawRows: unknown[][]): ParseResult<SystemImportRow> {
  const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, SYSTEM_COLS)
  if (colIndex.system_code === undefined) return { rows: [], errors: [], missingColumns: ['SISTEMA'] }
  const rows: SystemImportRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  rawRows.slice(headerRowIdx + 1).forEach((r, i) => {
    const row = headerRowIdx + i + 2
    const get = (f: string) => cellText(r, colIndex[f])
    const code = normalizeCode(get('system_code'), '')
    if (!code) return
    if (seen.has(code)) { errors.push(`Fila ${row}: el sistema ${code} está repetido`); return }
    seen.add(code)
    const type = parseSystemType(get('system_type'))
    const priority = parsePriority(get('priority'))
    if (type === undefined) errors.push(`Fila ${row}: tipo «${get('system_type')}» no válido (proceso, utility o seguridad) — ${code}`)
    if (priority === undefined) errors.push(`Fila ${row}: prioridad «${get('priority')}» no válida (P1 a P5) — ${code}`)
    rows.push({
      row,
      system_code: code,
      name: get('name') || null,
      system_type: type ?? null,
      priority: priority ?? null,
      battery_limits: cleanBatteryLimits({
        inlet: get('inlet'), outlet: get('outlet'), electrical: get('electrical'),
        instrumentation: get('instrumentation'), utilities: get('utilities'), notes: get('notes'),
      }),
    })
  })
  return { rows, errors, missingColumns: [] }
}

export function parseDependenciesSheet(rawRows: unknown[][]): ParseResult<DependencyImportRow> {
  const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, DEPENDENCY_COLS)
  const missingColumns = [
    colIndex.system_code === undefined && 'SISTEMA',
    colIndex.depends_on === undefined && 'DEPENDE DE',
  ].filter(Boolean) as string[]
  if (missingColumns.length) return { rows: [], errors: [], missingColumns }
  const rows: DependencyImportRow[] = []
  const errors: string[] = []
  rawRows.slice(headerRowIdx + 1).forEach((r, i) => {
    const row = headerRowIdx + i + 2
    const get = (f: string) => cellText(r, colIndex[f])
    const system = normalizeCode(get('system_code'), '')
    const provider = normalizeCode(get('depends_on'), '')
    if (!system && !provider) return
    if (!system || !provider) { errors.push(`Fila ${row}: falta ${system ? 'DEPENDE DE' : 'SISTEMA'}`); return }
    if (system === provider) { errors.push(`Fila ${row}: ${system} no puede depender de sí mismo`); return }
    const kind = parseDependencyKind(get('kind'))
    if (!kind) { errors.push(`Fila ${row}: tipo de dependencia «${get('kind')}» no válido (utility, proceso u otro)`); return }
    rows.push({
      row,
      system_code: system,
      depends_on_code: provider,
      kind,
      required_gate_code: get('required_gate').toUpperCase() || null,
      blocked_gate_code: get('blocked_gate').toUpperCase() || null,
      notes: get('notes').slice(0, 1000) || null,
    })
  })
  return { rows, errors, missingColumns: [] }
}

/**
 * Libro completo: la hoja de dependencias es la que trae SISTEMA + DEPENDE DE; la de sistemas,
 * la mejor del resto. Errores prefijados con el nombre lógico de la hoja.
 */
export function parseSystemsWorkbook(wb: XLSX.WorkBook, labels = { systems: 'Sistemas', dependencies: 'Dependencias' }) {
  const depSheet = wb.SheetNames.find(n => parseDependenciesSheet(sheetToRows(wb.Sheets[n])).missingColumns.length === 0)
  const rest = { ...wb, SheetNames: wb.SheetNames.filter(n => n !== depSheet) }
  const systems = rest.SheetNames.length ? parseSystemsSheet(pickBestSheet(rest, SYSTEM_COLS).rows) : { rows: [], errors: [], missingColumns: [] }
  const dependencies = depSheet ? parseDependenciesSheet(sheetToRows(wb.Sheets[depSheet])) : { rows: [], errors: [], missingColumns: [] }
  return {
    systems: systems.rows,
    dependencies: dependencies.rows,
    errors: [...systems.errors.map(x => `${labels.systems}: ${x}`), ...dependencies.errors.map(x => `${labels.dependencies}: ${x}`)],
  }
}
