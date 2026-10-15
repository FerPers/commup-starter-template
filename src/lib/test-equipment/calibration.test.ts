import { describe, expect, it } from 'vitest'
import { calibrationState, equipmentSignBlocker } from './calibration'

const eq = { calibrated_on: '2026-01-10', calibration_due: '2027-01-10' }

describe('calibración de equipos de prueba', () => {
  it('estado según la fecha', () => {
    expect(calibrationState(eq, '2026-06-01')).toBe('valid')
    expect(calibrationState(eq, '2026-12-20')).toBe('expiring')
    expect(calibrationState(eq, '2027-01-10')).toBe('expiring')
    expect(calibrationState(eq, '2027-01-11')).toBe('expired')
    expect(calibrationState(eq, '2026-01-09')).toBe('not_yet')
  })

  it('bloqueo de firma: vencido en la fecha de uso, o falta si la plantilla lo exige', () => {
    const ok = { code: 'MEG-01', used_on: '2026-06-01', ...eq }
    const late = { code: 'MEG-02', used_on: '2027-02-01', ...eq }
    expect(equipmentSignBlocker([ok], true)).toBeNull()
    expect(equipmentSignBlocker([ok, late], true)).toEqual({ kind: 'expired', codes: ['MEG-02'] })
    expect(equipmentSignBlocker([], true)).toEqual({ kind: 'missing' })
    expect(equipmentSignBlocker([], false)).toBeNull()
  })

  it('vence después del uso: no bloquea (fecha de uso, 13.42)', () => {
    expect(equipmentSignBlocker([{ code: 'CAL-01', used_on: '2026-12-01', ...eq }], true)).toBeNull()
  })
})
