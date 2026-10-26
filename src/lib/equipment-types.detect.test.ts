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
