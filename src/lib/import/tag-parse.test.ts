import { describe, expect, it } from 'vitest'
import { detectHeaderRow } from '@/lib/excel/detect-header'
import { TAG_COLUMNS, parseTagRows } from './tag-parse'

// Forma real de la lista de instrumentos de Akacías A2.2 (INS-LI-006): encabezado en dos filas, títulos de
// sección intercalados, «N/A» y «BY VENDOR LIST ECP» como relleno.
const ROWS: unknown[][] = [
  ['INGENIERÍA FEED CPF', '', '', '', '', '', '', '', '', 'ECP-…-INS-LI-006-2'],
  ['ITEM', 'TAG', 'DESCRIPCION', 'TIPO SEÑAL', 'RANGO/AJUSTE DE LA SEÑAL', '', '', 'SERVICIO', 'DATA SHEET', 'PLANOS', 'MARCA / MODELO'],
  ['', '', '', '', 'Inf.', 'Sup.', 'Unidad', '', '', 'P&ID', ''],
  ['', 'SISTEMA DE CRUDO'],
  ['', 'MULTIPLES DE RECIBO 762101A/B'],
  ['1', 'PIT-7621001', 'Transmisor indicador de presión', '4-20 mA + HART', '-14.7', '800', 'psig', 'Línea troncal norte', 'ECP-…-INS-HD-007', 'ECP-…-PRO-PID-120', 'BY VENDOR LIST ECP'],
  ['2', 'TW-7621001', 'Termopozo', 'N/A', 'N/A', 'N/A', 'N/A', 'Línea', 'ECP-…-INS-HD-008', 'N/A', 'N/A'],
  ['', 'NOTAS:'],
  ['', '1. Los diagramas de lazo y cableado serán elaborados en la siguiente etapa de la ingeniería.'],
]

describe('parseTagRows (lista de instrumentos de ingeniería)', () => {
  const { headerRowIdx, colIndex } = detectHeaderRow(ROWS, TAG_COLUMNS)
  const rows = parseTagRows(ROWS, colIndex, headerRowIdx + 1, 'INST')

  it('«TIPO SEÑAL» no es el tipo de equipo', () => {
    expect(colIndex.equipment_type).toBeUndefined()
    expect(rows[0].equipment_type_code).toBeUndefined()
  })
  it('lee el rango de «RANGO › Inf. | Sup. | Unidad»', () => {
    expect(rows[0]).toMatchObject({ range_min: -14.7, range_max: 800, eng_unit: 'psig' })
  })
  it('títulos de sección y notas no son tags', () => {
    expect(rows.map(r => r.tag_number)).toEqual(['PIT-7621001', 'TW-7621001'])
  })
  it('sin columnas de sistema: sistema › subsistema desde los títulos', () => {
    expect(rows[0]).toMatchObject({ system_code: 'SISTEMA-CRUDO', system_name: 'SISTEMA DE CRUDO', subsystem_code: 'MULTIPLES-RECIBO-762101A-B', subsystem_name: 'MULTIPLES DE RECIBO 762101A/B' })
  })
  it('«N/A» y «BY VENDOR LIST» se leen vacíos (no pisan nada al reimportar)', () => {
    expect(rows[0].manufacturer).toBeUndefined()
    expect(rows[1]).toMatchObject({ pid_drawing: undefined, eng_unit: undefined, range_min: undefined })
    expect(rows[0]).toMatchObject({ pid_drawing: 'ECP-…-PRO-PID-120', datasheet_number: 'ECP-…-INS-HD-007' })
  })
})
