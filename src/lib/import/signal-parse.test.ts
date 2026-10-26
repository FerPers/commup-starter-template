import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseSignalWorkbook } from './signal-parse'

const HEAD = ['', 'TAG DE SEÑAL', 'TAG INSTRUMENTO', 'DESCRIPCION', 'TIPO DE SEÑAL', 'SERVICIO', 'RANGO', '', '', 'P&ID']
const HEAD2 = ['', '', '', '', '', '', 'Inf.', 'Sup.', 'Unidad', '']

function book(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return wb
}

describe('parseSignalWorkbook (LI-001 de Akacías: DCS + ESD en hojas separadas)', () => {
  const wb = book({
    COVER_CARTA_V: [['INGENIERÍA FEED'], ['Lista de Señales']],
    'LISTADO-DCS': [
      HEAD, HEAD2, ['', 'SISTEMA DE CRUDO'],
      ['1', 'PI-7621002', 'PIT-7621002', 'Transmisor', 'AI+ HART', 'Presión', '-14.7', '800', 'psig', 'PID-120'],
      ['2', 'XI-7621001', 'XI-7621001', 'Comunicación', 'COMM', 'Modbus', 'N/A', 'N/A', 'N/A', '-'],
    ],
    'LISTADO-ESD': [
      HEAD, HEAD2, ['', 'MULTIPLES DE RECIBO'],
      ['1', 'SY-7621001', 'ESDV-7621001', 'Solenoide', 'DO', 'Cierre', 'N/A', 'N/A', 'N/A', 'PID-120'],
      ['2', 'ZZ-7621009', 'ZZ-7621009', 'Raro', 'XYZ', '', '', '', '', ''],
    ],
  })
  const r = parseSignalWorkbook(wb, new Set(['INST']))

  it('lee todas las hojas con lista de señales, no solo una', () => {
    expect(r.sheets).toEqual([{ name: 'LISTADO-DCS', signals: 2 }, { name: 'LISTADO-ESD', signals: 2 }])
  })
  it('normaliza el tipo y deja fuera títulos de sección', () => {
    expect(r.rows.map(x => [x.signal_tag, x.signal_type])).toEqual([
      ['PI-7621002', 'AI'], ['XI-7621001', 'COMM'], ['SY-7621001', 'DO'], ['ZZ-7621009', 'XYZ'],
    ])
  })
  it('reporta el tipo desconocido con su hoja y fila', () => {
    expect(r.issues).toEqual([{ kind: 'badType', sheet: 'LISTADO-ESD', row: 5, value: 'XYZ', tag: 'ZZ-7621009' }])
  })
  it('rango e instrumento; «N/A» vacío', () => {
    expect(r.rows[0]).toMatchObject({ instrument_tag: 'PIT-7621002', range_min: -14.7, range_max: 800, eng_unit: 'psig' })
    expect(r.rows[1]).toMatchObject({ range_min: null, eng_unit: '', pid_drawing: '' })
  })
})
