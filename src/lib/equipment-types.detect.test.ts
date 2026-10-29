import { describe, expect, it } from 'vitest'
import { detectEquipmentTypeCode } from './equipment-types'

describe('detectEquipmentTypeCode — variantes ISA', () => {
  it('el código exacto gana', () => {
    expect(detectEquipmentTypeCode('ESDV-7621001')).toBe('ESDV')
    expect(detectEquipmentTypeCode('PT-101')).toBe('PT')
  })
  it('transmisores indicadores y medidores locales caen en su tipo estándar', () => {
    expect(detectEquipmentTypeCode('PIT-7621001')).toBe('PT')
    expect(detectEquipmentTypeCode('LIT-7621001')).toBe('LT')
    expect(detectEquipmentTypeCode('TIT-7621001')).toBe('TT')
    expect(detectEquipmentTypeCode('FIT-7624001')).toBe('FT')
    expect(detectEquipmentTypeCode('AIT-7621001')).toBe('AT')
    expect(detectEquipmentTypeCode('PDIT-7621001')).toBe('PT')
    expect(detectEquipmentTypeCode('PG-7621001')).toBe('PI')
    expect(detectEquipmentTypeCode('TG-7621001')).toBe('TI')
    expect(detectEquipmentTypeCode('LG-7621001')).toBe('LI')
    expect(detectEquipmentTypeCode('PVV-7621001')).toBe('PSV')
  })
  it('lo que no conoce queda sin tipo', () => {
    expect(detectEquipmentTypeCode('TW-7621001')).toBeNull()
    expect(detectEquipmentTypeCode('ZSC-7621001')).toBeNull()
    expect(detectEquipmentTypeCode('7621001')).toBeNull()
  })
})

describe('detectEquipmentTypeCode — lista eléctrica (CPF Orotoy ELE-LI-102)', () => {
  it('sinónimos de la lista', () => {
    expect(detectEquipmentTypeCode('TRF-76029001')).toBe('T')
    expect(detectEquipmentTypeCode('CCM-CPF-1')).toBe('MCC')
    expect(detectEquipmentTypeCode('TSA-AC-01')).toBe('TAB')
    expect(detectEquipmentTypeCode('LCP.KRCP-11501')).toBe('CP')
    expect(detectEquipmentTypeCode('KRCP-11501')).toBe('REC')
  })
  it('ubicación primero: el tipo está en el segundo bloque', () => {
    expect(detectEquipmentTypeCode('PR01-UPS-AC-01')).toBe('UPS')
    expect(detectEquipmentTypeCode('PR02-HVAC-01')).toBe('TAB')
    expect(detectEquipmentTypeCode('PR03-COND-01-A')).toBe('COND')
    expect(detectEquipmentTypeCode('CPF-DPS-A')).toBe('DPS')
    expect(detectEquipmentTypeCode('CPF-FL-A')).toBe('FUS')
  })
  it('el sufijo de un tren no es un tipo; lo desconocido queda sin tipo', () => {
    expect(detectEquipmentTypeCode('XY-7620001C')).toBeNull()
    expect(detectEquipmentTypeCode('ZSC-7620001A')).toBeNull()
    expect(detectEquipmentTypeCode('PR02-DB-01A')).toBeNull()
    expect(detectEquipmentTypeCode('10-PT-1001A')).toBe('PT')
  })
})
