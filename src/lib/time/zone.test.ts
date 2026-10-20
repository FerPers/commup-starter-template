import { describe, expect, it } from 'vitest'
import { addDaysIso, dateTimeIn, daysBetween, isValidTimeZone, latestPossibleToday, timeIn, todayIn, zoneLabel } from './zone'

describe('zona horaria del proyecto (S10)', () => {
  // 2026-10-20 01:30 UTC = 2026-10-19 20:30 en Bogotá (UTC−5)
  const evening = new Date('2026-10-20T01:30:00Z')

  it('«hoy» del proyecto no es el de UTC desde las 19:00 en Colombia', () => {
    expect(todayIn('America/Bogota', evening)).toBe('2026-10-19')
    expect(todayIn('UTC', evening)).toBe('2026-10-20')
    expect(todayIn('Asia/Dubai', new Date('2026-10-19T21:00:00Z'))).toBe('2026-10-20')
  })

  it('zona inválida o vacía cae a America/Bogota', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('America/Caracas')).toBe(true)
    expect(todayIn('Mars/Olympus', evening)).toBe('2026-10-19')
    expect(todayIn(null, evening)).toBe('2026-10-19')
  })

  it('aritmética de fechas sin pasar por la zona del servidor', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-10-17', '2026-10-20')).toBe(3)
  })

  it('la cota UTC+14 nunca queda detrás del día local de ninguna zona', () => {
    for (const tz of ['America/Bogota', 'UTC', 'Asia/Dubai', 'Pacific/Auckland']) {
      expect(latestPossibleToday(evening) >= todayIn(tz, evening)).toBe(true)
    }
  })

  it('horas en la zona del proyecto', () => {
    expect(timeIn('2026-10-20T01:30:00Z', 'America/Bogota')).toBe('20:30')
    expect(dateTimeIn('2026-10-20T01:30:00Z', 'America/Bogota')).toBe('2026-10-19 20:30')
    expect(zoneLabel('America/Bogota', evening)).toBe('GMT-5')
  })
})
