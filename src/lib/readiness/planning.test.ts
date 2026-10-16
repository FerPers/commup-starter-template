import { describe, expect, it } from 'vitest'
import { addDays, gateAtRisk, gateGap, groupBySystem, inWindow, normalizeWeights, sortLookahead, type LookaheadItem } from './planning'

const item = (over: Partial<LookaheadItem>): LookaheadItem => ({
  kind: 'action', id: 'x', ref: 'ACC-0001', title: 't', systemId: null, systemCode: null, date: '2026-10-20', status: 'open', href: '#', ...over,
})

describe('planificación — look-ahead', () => {
  it('brecha forecast − compromiso', () => {
    expect(gateGap('2026-10-25', '2026-10-20')).toBe(5)
    expect(gateGap('2026-10-18', '2026-10-20')).toBe(-2)
    expect(gateGap(null, '2026-10-20')).toBeNull()
  })

  it('riesgo: en la ventana y no listo ni aprobado', () => {
    expect(gateAtRisk('not_ready', '2026-10-20', '2026-10-23')).toBe(true)
    expect(gateAtRisk('regressed', '2026-10-01', '2026-10-23')).toBe(true)
    expect(gateAtRisk('ready', '2026-10-20', '2026-10-23')).toBe(false)
    expect(gateAtRisk('approved', '2026-10-20', '2026-10-23')).toBe(false)
    expect(gateAtRisk('not_ready', '2026-11-20', '2026-10-23')).toBe(false)
  })

  it('ventana incluye vencidas', () => {
    expect(inWindow('2026-09-01', '2026-10-23')).toBe(true)
    expect(inWindow('2026-10-24', '2026-10-23')).toBe(false)
    expect(inWindow(null, '2026-10-23')).toBe(false)
    expect(addDays('2026-10-16', 7)).toBe('2026-10-23')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('orden por fecha y gates primero; agrupa por sistema con «sin sistema» al final', () => {
    const rows = [
      item({ id: '1', ref: 'ACC-0002', date: '2026-10-20', systemId: 'b', systemCode: 'B' }),
      item({ id: '2', kind: 'gate', ref: 'MC', date: '2026-10-20', systemId: 'b', systemCode: 'B' }),
      item({ id: '3', ref: 'ACC-0001', date: '2026-10-18' }),
      item({ id: '4', kind: 'tq', ref: 'TQ-0001', date: '2026-10-19', systemId: 'a', systemCode: 'A' }),
    ]
    expect(sortLookahead(rows).map(r => r.id)).toEqual(['3', '4', '2', '1'])
    expect(groupBySystem(rows).map(g => [g.systemCode, g.items.map(i => i.id)])).toEqual([['A', ['4']], ['B', ['2', '1']], [null, ['3']]])
  })

  it('pesos normalizados como en SQL', () => {
    expect(normalizeWeights([null, null, null, null])).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(normalizeWeights([10, 20, 30, 40])).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(normalizeWeights([0, 0])).toEqual([0, 0])
  })
})
