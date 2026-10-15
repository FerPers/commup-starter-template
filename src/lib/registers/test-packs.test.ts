import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { isRegisterNumber, lineStates, summarize } from './test-packs'
import { parseLinesSheet, parseMedium, parsePacksSheet, parseTestPackWorkbook, parseTestType } from './test-packs-import'
import { parseRegisterQr, registerQrUrl } from './qr'

describe('avance derivado de las líneas (§8.6)', () => {
  it('probada si algún pack verificado; en prueba si activo/retirado; cancelados no cuentan', () => {
    const s = lineStates([
      { id: 'p1', status: 'verified', lineIds: ['a', 'b'] },
      { id: 'p2', status: 'active', lineIds: ['b', 'c'] },
      { id: 'p3', status: 'removed', lineIds: ['d'] },
      { id: 'p4', status: 'authorized', lineIds: ['e'] },
      { id: 'p5', status: 'cancelled', lineIds: ['f', 'a'] },
    ])
    expect(s.get('a')).toBe('tested')
    expect(s.get('b')).toBe('tested')
    expect(s.get('c')).toBe('in_test')
    expect(s.get('d')).toBe('in_test')
    expect(s.get('e')).toBe('pending')
    expect(s.has('f')).toBe(false)
  })

  it('resumen con porcentaje de probadas', () => {
    expect(summarize(['tested', 'tested', 'in_test', 'pending'])).toEqual({ total: 4, pending: 1, in_test: 1, tested: 2, pct: 50 })
    expect(summarize([]).pct).toBe(0)
  })
})

describe('importación Excel de test packs (§8.7)', () => {
  it('valores de celda en español o inglés', () => {
    expect(parseTestType('Hidrostática')).toBe('hydrostatic')
    expect(parseTestType('PNEUMATIC')).toBe('pneumatic')
    expect(parseTestType('')).toBeNull()
    expect(parseTestType('vacío')).toBeUndefined()
    expect(parseMedium('Nitrógeno')).toBe('nitrogen')
    expect(parseMedium('N2')).toBe('nitrogen')
    expect(parseMedium('Agua')).toBe('water')
  })

  it('hoja de packs: datos de prueba, repetidos y números inválidos', () => {
    const res = parsePacksSheet([
      ['TEST PACK', 'TÍTULO', 'SISTEMA', 'TIPO PRUEBA', 'MEDIO', 'PRESIÓN PRUEBA', 'RETENCIÓN'],
      ['tp-101', 'Descarga P-101', 'a100-s01', 'Hidrostática', 'Agua', '15,5', '60'],
      ['TP-101', 'repetido', '', '', '', '', ''],
      ['TP-102', '', '', 'Neumática', 'Aire', 'mucha', ''],
    ])
    expect(res.rows).toHaveLength(2)
    expect(res.rows[0]).toMatchObject({ pack: 'TP-101', title: 'Descarga P-101', system_code: 'A100-S01', data: { test_type: 'hydrostatic', medium: 'water', test_pressure: 15.5, hold_minutes: 60 } })
    expect(res.errors.some(e => e.includes('repetido'))).toBe(true)
    expect(res.errors.some(e => e.includes('mucha'))).toBe(true)
  })

  it('hoja de líneas: normaliza, omite duplicados y reporta filas incompletas', () => {
    const res = parseLinesSheet([
      ['LÍNEA', 'TEST PACK'],
      ['2"-P-1001-A1', 'tp-101'],
      ['2"-P-1001-A1', 'TP-101'],
      ['', 'TP-102'],
    ])
    expect(res.rows).toEqual([{ row: 2, line: '2"-P-1001-A1', pack: 'TP-101' }])
    expect(res.errors).toHaveLength(1)
  })

  it('libro: distingue la hoja de packs de la de líneas sin importar el orden', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LÍNEA', 'TEST PACK'], ['L-1', 'TP-1']]), 'Líneas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['TEST PACK', 'TÍTULO', 'PRESIÓN PRUEBA'], ['TP-1', 'Uno', '10']]), 'Packs')
    const res = parseTestPackWorkbook(wb)
    expect(res.packs.map(p => p.pack)).toEqual(['TP-1'])
    expect(res.lines.map(l => l.line)).toEqual(['L-1'])
  })

  it('número de CommUp vs número del cliente', () => {
    expect(isRegisterNumber('TPK-0001')).toBe(true)
    expect(isRegisterNumber('TP-101')).toBe(false)
  })
})

describe('QR de registros (§8.9)', () => {
  const id = '3f2b8c1e-9a4d-4e7b-8c6a-1d2e3f4a5b6c'
  it('ida y vuelta de la URL', () => {
    expect(registerQrUrl('https://commup.app/', id)).toBe(`https://commup.app/r/${id}`)
    expect(parseRegisterQr(registerQrUrl('https://commup.app', id))).toBe(id)
    expect(parseRegisterQr(`http://localhost:3000/r/${id.toUpperCase()}?x=1`)).toBe(id)
  })
  it('no confunde tags ni URLs ajenas', () => {
    expect(parseRegisterQr('https://commup.app/tag_360/EQ-001-PUMP-001')).toBeNull()
    expect(parseRegisterQr('https://commup.app/r/not-a-uuid')).toBeNull()
  })
})
