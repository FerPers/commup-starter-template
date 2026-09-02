import * as XLSX from 'xlsx'

// ── Detección de hoja y encabezado en Excel de ingeniería ────────────────────
// Compartido por los importadores de tags y de señales. Los índices de
// instrumentos, listas eléctricas y signal lists rara vez traen el encabezado
// en la fila 1: suelen tener carátula, logos, o encabezados de dos filas.

export type ColumnKeywords = Record<string, readonly string[]>

const SCAN_ROWS = 15

/** Normaliza un encabezado: sin acentos, mayúsculas, `_` y espacios múltiples → un espacio. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

export function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
}

function allKeywords(colKeywords: ColumnKeywords): string[] {
  return Object.values(colKeywords).flat().map(normalizeHeader)
}

function rowScore(cells: string[], keywords: string[]): number {
  return keywords.filter(kw => cells.some(c => c === kw || c.includes(kw))).length
}

/** Elige la hoja con más encabezados reconocibles (evita carátulas e índices). */
export function pickBestSheet(
  wb: XLSX.WorkBook,
  colKeywords: ColumnKeywords,
): { name: string; rows: unknown[][] } {
  const kws = allKeywords(colKeywords)
  let best: { name: string; rows: unknown[][]; score: number } = { name: wb.SheetNames[0], rows: [], score: -1 }
  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[name])
    let score = 0
    for (let i = 0; i < Math.min(rows.length, SCAN_ROWS); i++) {
      score += rowScore(rows[i].map(normalizeHeader), kws)
    }
    if (score > best.score) best = { name, rows, score }
  }
  return { name: best.name, rows: best.rows }
}

function findColumn(width: number, used: Set<number>, match: (col: number) => boolean): number {
  for (let col = 0; col < width; col++) {
    if (used.has(col)) continue
    if (match(col)) return col
  }
  return -1
}

/**
 * Busca la fila de encabezado entre las primeras 15 y mapea cada campo a su
 * columna. Considera también la fila siguiente (encabezados de dos filas).
 * Para cada campo prueba primero coincidencia exacta y luego parcial, y no
 * reutiliza una columna ya asignada — así "TAG" no se roba "TAG INSTRUMENTO".
 */
export function detectHeaderRow(
  rawRows: unknown[][],
  colKeywords: ColumnKeywords,
): { headerRowIdx: number; colIndex: Record<string, number>; headers: string[] } {
  const kws = allKeywords(colKeywords)
  let bestRow = -1
  let bestScore = 0
  for (let i = 0; i < Math.min(rawRows.length, SCAN_ROWS); i++) {
    const score = rowScore(rawRows[i].map(normalizeHeader), kws)
    if (score > bestScore) { bestScore = score; bestRow = i }
  }
  if (bestRow < 0) return { headerRowIdx: 0, colIndex: {}, headers: [] }

  const h1 = rawRows[bestRow].map(normalizeHeader)
  const h2 = (rawRows[bestRow + 1] ?? []).map(normalizeHeader)
  const width = Math.max(h1.length, h2.length)
  const used = new Set<number>()
  const colIndex: Record<string, number> = {}

  for (const [field, keywords] of Object.entries(colKeywords)) {
    const normKws = keywords.map(normalizeHeader)
    let col = findColumn(width, used, c => normKws.some(kw => h1[c] === kw || h2[c] === kw))
    if (col < 0) {
      col = findColumn(width, used, c => normKws.some(kw => (h1[c] ?? '').includes(kw) || (h2[c] ?? '').includes(kw)))
    }
    if (col >= 0) { colIndex[field] = col; used.add(col) }
  }
  return { headerRowIdx: bestRow, colIndex, headers: h1 }
}

/** Lee una celda como texto recortado; '' si la columna no existe. */
export function cellText(row: unknown[], col: number | undefined): string {
  return col === undefined ? '' : String(row[col] ?? '').trim()
}
