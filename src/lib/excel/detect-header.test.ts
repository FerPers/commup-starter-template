import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { cellText, detectHeaderRow, normalizeHeader, pickBestSheet, sheetToRows } from './detect-header'

const KW = {
  tag: ['TAG', 'TAG NUMBER', 'TAG INSTRUMENTO'],
  description: ['DESCRIPCION', 'DESCRIPTION', 'SERVICIO'],
  subsystem: ['SUBSISTEMA', 'SUBSYSTEM'],
} as const

function wb(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const book = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)
  return book
}

describe('normalizeHeader', () => {
  it('quita acentos, mayúsculas, guiones bajos y espacios múltiples', () => {
    expect(normalizeHeader(' Descripción_del   equipo ')).toBe('DESCRIPCION DEL EQUIPO')
    expect(normalizeHeader(null)).toBe('')
    expect(normalizeHeader(12)).toBe('12')
  })
})

describe('detectHeaderRow', () => {
  it('encuentra el encabezado aunque haya carátula y filas vacías antes', () => {
    const rows: unknown[][] = [
      ['PROYECTO X — ÍNDICE DE INSTRUMENTOS'],
      [],
      ['Rev', 'B', '', '2026-09-01'],
      ['TAG', 'Descripción', 'Subsistema', 'P&ID'],
      ['FT-101', 'Flujo entrada', 'SS-01', 'PID-001'],
    ]
    const r = detectHeaderRow(rows, KW)
    expect(r.headerRowIdx).toBe(3)
    expect(r.colIndex).toEqual({ tag: 0, description: 1, subsystem: 2 })
  })

  it('no deja que "TAG" se robe la columna "TAG INSTRUMENTO" (exacto antes que parcial, sin reutilizar)', () => {
    const rows: unknown[][] = [['TAG INSTRUMENTO', 'TAG', 'DESCRIPCION']]
    const r = detectHeaderRow(rows, { tag: ['TAG'], instrumentTag: ['TAG INSTRUMENTO'], description: ['DESCRIPCION'] })
    expect(r.colIndex.tag).toBe(1)
    expect(r.colIndex.instrumentTag).toBe(0)
  })

  it('soporta encabezados de dos filas', () => {
    const rows: unknown[][] = [
      ['Identificación', '', 'Ubicación'],
      ['TAG', 'DESCRIPCION', 'SUBSYSTEM'],
      ['P-101', 'Bomba', 'SS-02'],
    ]
    const r = detectHeaderRow(rows, KW)
    expect(r.headerRowIdx).toBe(1)
    expect(r.colIndex.subsystem).toBe(2)
  })

  it('sin coincidencias devuelve fila 0 y mapa vacío', () => {
    const r = detectHeaderRow([['a', 'b'], ['1', '2']], KW)
    expect(r).toEqual({ headerRowIdx: 0, colIndex: {}, headers: [] })
  })
})

describe('pickBestSheet', () => {
  it('elige la hoja con encabezados reconocibles y no la carátula', () => {
    const book = wb({
      Portada: [['CommUp'], ['Índice de equipos'], ['Rev A']],
      Equipos: [['TAG', 'DESCRIPCION', 'SUBSISTEMA'], ['P-101', 'Bomba', 'SS-01']],
    })
    const best = pickBestSheet(book, KW)
    expect(best.name).toBe('Equipos')
    expect(best.rows[1]).toEqual(['P-101', 'Bomba', 'SS-01'])
  })
})

describe('sheetToRows / cellText', () => {
  it('celdas vacías como "" y cellText recorta', () => {
    const book = wb({ S: [['TAG', ''], ['  X-1  ', null]] })
    const rows = sheetToRows(book.Sheets.S)
    expect(cellText(rows[1], 0)).toBe('X-1')
    expect(cellText(rows[1], 1)).toBe('')
    expect(cellText(rows[1], undefined)).toBe('')
  })
})
