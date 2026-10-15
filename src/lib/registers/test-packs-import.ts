import type * as XLSX from 'xlsx'
import { cellText, detectHeaderRow, sheetToRows, type ColumnKeywords } from '@/lib/excel/detect-header'
import { normalizeCode } from '@/lib/excel/normalize'
import { packKey } from './test-packs'

// ── Importación Excel de test packs (§8.7): hoja «Packs» + hoja «Líneas» ─────────────────
// Puro: recibe filas (`sheet_to_json` con header: 1) y devuelve filas limpias + errores.

export const PACK_COLS: ColumnKeywords = {
  pack: ['TEST PACK', 'PACK', 'NUMERO PACK', 'PAQUETE'],
  title: ['TITULO', 'DESCRIPCION', 'TITLE', 'DESCRIPTION'],
  system_code: ['SISTEMA', 'SYSTEM'],
  test_type: ['TIPO PRUEBA', 'TIPO', 'TEST TYPE', 'TYPE'],
  medium: ['MEDIO', 'FLUIDO', 'MEDIUM', 'TEST MEDIUM'],
  design_pressure: ['PRESION DISENO', 'DESIGN PRESSURE'],
  test_pressure: ['PRESION PRUEBA', 'TEST PRESSURE'],
  hold_minutes: ['RETENCION', 'DURACION', 'HOLD', 'HOLD TIME', 'MINUTOS'],
  boundary: ['LIMITES', 'BOUNDARY', 'LIMITES PRUEBA'],
}

export const LINE_COLS: ColumnKeywords = {
  line: ['LINEA', 'TAG LINEA', 'LINE', 'LINE NUMBER', 'TAG'],
  pack: ['TEST PACK', 'PACK', 'NUMERO PACK', 'PAQUETE'],
}

export type PackImportRow = {
  row: number
  /** Número tal como viene (TPK-0003) o etiqueta libre del cliente (TP-101): ver `isRegisterNumber`. */
  pack: string
  title: string | null
  system_code: string | null
  data: Record<string, string | number>
}

export type LineImportRow = { row: number; line: string; pack: string }

type Parsed<T> = { rows: T[]; errors: string[]; missingColumns: string[] }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export function parseTestType(v: string): 'hydrostatic' | 'pneumatic' | 'service' | null | undefined {
  const s = strip(v)
  if (!s) return null
  if (s.startsWith('hidro') || s.startsWith('hydro')) return 'hydrostatic'
  if (s.startsWith('neum') || s.startsWith('pneum')) return 'pneumatic'
  if (s.startsWith('servic') || s.startsWith('in service') || s.startsWith('in-service')) return 'service'
  return undefined
}

export function parseMedium(v: string): 'water' | 'air' | 'nitrogen' | 'other' | null | undefined {
  const s = strip(v)
  if (!s) return null
  if (s.startsWith('agua') || s.startsWith('water')) return 'water'
  if (s.startsWith('aire') || s.startsWith('air')) return 'air'
  if (s.startsWith('nitr') || s === 'n2') return 'nitrogen'
  if (s.startsWith('otr') || s.startsWith('other')) return 'other'
  return undefined
}

function parseNumber(v: string): number | null | undefined {
  const s = v.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function parsePacksSheet(rawRows: unknown[][]): Parsed<PackImportRow> {
  const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, PACK_COLS)
  if (colIndex.pack === undefined) return { rows: [], errors: [], missingColumns: ['TEST PACK'] }
  const rows: PackImportRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  rawRows.slice(headerRowIdx + 1).forEach((r, i) => {
    const row = headerRowIdx + i + 2
    const get = (f: string) => cellText(r, colIndex[f])
    const pack = packKey(get('pack'))
    if (!pack) return
    if (seen.has(pack)) { errors.push(`Fila ${row}: el pack ${pack} está repetido`); return }
    seen.add(pack)
    const data: Record<string, string | number> = {}
    const type = parseTestType(get('test_type'))
    const medium = parseMedium(get('medium'))
    if (type === undefined) errors.push(`Fila ${row}: tipo de prueba «${get('test_type')}» no válido (hidrostática, neumática o servicio) — ${pack}`)
    else if (type) data.test_type = type
    if (medium === undefined) errors.push(`Fila ${row}: medio «${get('medium')}» no válido (agua, aire, nitrógeno u otro) — ${pack}`)
    else if (medium) data.medium = medium
    for (const f of ['design_pressure', 'test_pressure', 'hold_minutes'] as const) {
      const n = parseNumber(get(f))
      if (n === undefined) errors.push(`Fila ${row}: «${get(f)}» no es un número válido — ${pack}`)
      else if (n !== null) data[f] = n
    }
    const boundary = get('boundary').slice(0, 2000)
    if (boundary) data.boundary = boundary
    rows.push({
      row,
      pack,
      title: get('title').slice(0, 200) || null,
      system_code: normalizeCode(get('system_code'), '') || null,
      data,
    })
  })
  return { rows, errors, missingColumns: [] }
}

export function parseLinesSheet(rawRows: unknown[][]): Parsed<LineImportRow> {
  const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, LINE_COLS)
  const missingColumns = [colIndex.line === undefined && 'LÍNEA', colIndex.pack === undefined && 'TEST PACK'].filter(Boolean) as string[]
  if (missingColumns.length) return { rows: [], errors: [], missingColumns }
  const rows: LineImportRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  rawRows.slice(headerRowIdx + 1).forEach((r, i) => {
    const row = headerRowIdx + i + 2
    const line = cellText(r, colIndex.line).trim().toUpperCase()
    const pack = packKey(cellText(r, colIndex.pack))
    if (!line && !pack) return
    if (!line || !pack) { errors.push(`Fila ${row}: falta ${line ? 'TEST PACK' : 'LÍNEA'}`); return }
    const k = `${line}→${pack}`
    if (seen.has(k)) return
    seen.add(k)
    rows.push({ row, line, pack })
  })
  return { rows, errors, missingColumns: [] }
}

/**
 * Libro completo: la hoja de líneas es la que trae LÍNEA + TEST PACK sin columnas de presión;
 * la de packs, la que trae TEST PACK y algún dato de prueba. Un libro con solo la hoja de
 * líneas es válido (los packs que no existan se crean con el número como título).
 */
export function parseTestPackWorkbook(wb: XLSX.WorkBook, labels = { packs: 'Packs', lines: 'Líneas' }) {
  const sheets = wb.SheetNames.map(n => ({ n, rows: sheetToRows(wb.Sheets[n]) }))
  const linesSheet = sheets.find(s => parseLinesSheet(s.rows).missingColumns.length === 0 &&
    detectHeaderRow(s.rows, PACK_COLS).colIndex.test_pressure === undefined)
  const packsSheet = sheets.find(s => s !== linesSheet && parsePacksSheet(s.rows).missingColumns.length === 0)
  const packs = packsSheet ? parsePacksSheet(packsSheet.rows) : { rows: [], errors: [] }
  const lines = linesSheet ? parseLinesSheet(linesSheet.rows) : { rows: [], errors: [] }
  return {
    packs: packs.rows,
    lines: lines.rows,
    errors: [...packs.errors.map(x => `${labels.packs}: ${x}`), ...lines.errors.map(x => `${labels.lines}: ${x}`)],
  }
}
