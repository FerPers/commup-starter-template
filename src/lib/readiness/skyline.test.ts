import { describe, expect, it } from 'vitest'
import {
  addMonths, buildColumns, buildSkyline, defaultSkylineGate, parseSkylineParams, shiftFrom, skylineQuery, skylineTone,
  weekStart, type SkylineSystem,
} from './skyline'

const TODAY = '2026-10-22' // jueves

const sys = (code: string, over: Partial<SkylineSystem> = {}): SkylineSystem => ({
  systemId: code, systemCode: code, systemName: code, areaCode: code.slice(0, 4),
  status: 'not_ready', commitment: null, forecast: null, pct: 0, itrTotal: 4, ...over,
})

describe('fechas', () => {
  it('weekStart devuelve el lunes', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19')
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(weekStart('2026-10-25')).toBe('2026-10-19') // domingo
  })
  it('addMonths cae en el día 1', () => {
    expect(addMonths('2026-10-22', 1)).toBe('2026-11-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
  })
})

describe('buildColumns', () => {
  it('semanas: 2 atrás, la actual y 9 adelante', () => {
    const cols = buildColumns(TODAY, 'week')
    expect(cols).toHaveLength(12)
    expect(cols[0]).toEqual({ start: '2026-10-05', end: '2026-10-11', isCurrent: false })
    expect(cols[2].isCurrent).toBe(true)
    expect(cols[11].end).toBe('2026-12-27')
  })
  it('meses: 1 atrás y 4 adelante', () => {
    const cols = buildColumns(TODAY, 'month')
    expect(cols.map(c => c.start)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
    expect(cols[0].end).toBe('2026-09-30')
    expect(cols[1].isCurrent).toBe(true)
  })
  it('from fija el inicio y las flechas corren un tercio', () => {
    expect(buildColumns(TODAY, 'week', '2026-11-04')[0].start).toBe('2026-11-02')
    expect(shiftFrom(TODAY, 'week', null, 1)).toBe('2026-11-02')
    expect(shiftFrom(TODAY, 'month', null, -1)).toBe('2026-07-01')
  })
})

describe('buildSkyline', () => {
  it('compromiso manda sobre pronóstico; sin fecha va a la bandeja', () => {
    const s = buildSkyline([
      sys('A', { commitment: '2026-10-28', forecast: '2026-11-20' }),
      sys('B', { forecast: '2026-10-29' }),
      sys('C'),
    ], TODAY, 'week')
    expect(s.stacks[3].map(b => [b.systemCode, b.basis])).toEqual([['A', 'commitment'], ['B', 'forecast']])
    expect(s.undated.map(x => x.systemCode)).toEqual(['C'])
  })
  it('tono por avance y aprobada por estado; vencida = pasada y sin aprobar', () => {
    const s = buildSkyline([
      sys('OK', { commitment: '2026-10-06', status: 'approved', pct: 0.4 }),
      sys('MID', { commitment: '2026-10-07', pct: 0.5 }),
      sys('LOW', { commitment: '2026-10-30', pct: 0.49 }),
    ], TODAY, 'week')
    const [ok, mid] = s.stacks[0]
    expect([ok.tone, ok.overdue]).toEqual(['approved', false])
    expect([mid.tone, mid.overdue]).toEqual(['mid', true])
    expect([s.stacks[3][0].tone, s.stacks[3][0].overdue]).toEqual(['low', false])
  })
  it('fuera del rango se cuenta antes o después', () => {
    const s = buildSkyline([sys('X', { commitment: '2026-09-01' }), sys('Y', { commitment: '2027-03-01' })], TODAY, 'week')
    expect(s.before.map(b => b.systemCode)).toEqual(['X'])
    expect(s.after.map(b => b.systemCode)).toEqual(['Y'])
    expect(s.stacks.flat()).toHaveLength(0)
  })
  it('regresión no cuenta como aprobada', () => {
    expect(skylineTone('regressed', 1)).toBe('mid')
    expect(skylineTone('approved_with_conditions', 0)).toBe('approved')
  })
})

describe('defaultSkylineGate', () => {
  it('la primera con algún sistema sin aprobar; si todo aprobado, la última', () => {
    expect(defaultSkylineGate([
      { gateId: 'RFC', order: 3, statuses: ['not_ready'] },
      { gateId: 'MC', order: 1, statuses: ['approved', 'approved'] },
      { gateId: 'RFPC', order: 2, statuses: ['approved', 'ready'] },
    ])).toBe('RFPC')
    expect(defaultSkylineGate([{ gateId: 'MC', order: 1, statuses: ['approved'] }, { gateId: 'RFC', order: 2, statuses: ['approved'] }])).toBe('RFC')
    expect(defaultSkylineGate([])).toBeNull()
  })
})

describe('parámetros', () => {
  it('ignora lo desconocido y omite los valores por defecto', () => {
    const p = parseSkylineParams({ gate: 'g1', scale: 'year', from: '2026-13-40' })
    expect(p).toEqual({ gate: 'g1', scale: 'week', from: undefined })
    expect(skylineQuery(p)).toBe('?gate=g1')
    expect(skylineQuery({ scale: 'month', from: '2026-11-01' })).toBe('?scale=month&from=2026-11-01')
  })
})
