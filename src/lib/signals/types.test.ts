import { describe, expect, it } from 'vitest'
import { normalizeSignalType } from './types'

describe('normalizeSignalType', () => {
  it('reconoce el tipo como lo escriben las listas de señales', () => {
    expect(normalizeSignalType('AI+ HART')).toBe('AI')
    expect(normalizeSignalType('AO + HART')).toBe('AO')
    expect(normalizeSignalType(' di ')).toBe('DI')
    expect(normalizeSignalType('Digital Output')).toBe('DO')
    expect(normalizeSignalType('Analog Input')).toBe('AI')
    expect(normalizeSignalType('Entrada digital')).toBe('DI')
    expect(normalizeSignalType('COMM')).toBe('COMM')
    expect(normalizeSignalType('COM')).toBe('COMM')
    expect(normalizeSignalType('Modbus RTU')).toBe('COMM')
  })
  it('no inventa: vacío o desconocido = null', () => {
    expect(normalizeSignalType('')).toBeNull()
    expect(normalizeSignalType('24 VDC')).toBeNull()
    expect(normalizeSignalType('AIR')).toBeNull()
  })
})
