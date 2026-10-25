import { describe, expect, it } from 'vitest'
import type { GateStatus, MatrixGate } from './gates'
import { blockerCount, filterMatrix, nextGate, parseMatrixFilters, readinessSummary, rowState, type MatrixRow } from './matrix'

const g = (code: string, order: number, status: GateStatus, extra: Partial<MatrixGate> = {}): MatrixGate => ({
  gate_id: `g-${code}`, code, name: code, order, computed_level: 'red', status, failing: 0, approval: null, ...extra,
})
const row = (code: string, gates: MatrixGate[], area = 'A1'): MatrixRow => ({
  system_id: `s-${code}`, system_code: code, system_name: `Sistema ${code}`, area_code: area, area_name: area, gates,
})

describe('matriz de Control Tower (S23)', () => {
  it('A47: «Solo con bloqueo» deja fuera lo que está en ejecución o sin información', () => {
    const rows = [
      row('S1', [g('MC', 1, 'not_ready', { work_state: 'blocked' })]),
      row('S2', [g('MC', 1, 'not_ready', { work_state: 'work' })]),
      row('S3', [g('MC', 1, 'not_ready', { work_state: 'nodata' })]),
      row('S4', [g('MC', 1, 'regressed')]),
    ]
    const ctx = { commitment: () => null, changedIds: new Set<string>(), today: '2026-10-25' }
    expect(filterMatrix(rows, { blocked: true }, ctx).map(r => r.system_code).sort()).toEqual(['S1', 'S4'])
    expect(filterMatrix(rows, { state: 'nodata' }, ctx).map(r => r.system_code)).toEqual(['S3'])
  })

  it('siguiente gate: la regresión manda; si no, el primero sin aprobar', () => {
    expect(nextGate([g('MC', 1, 'approved'), g('RFC', 2, 'not_ready')])?.code).toBe('RFC')
    expect(nextGate([g('MC', 1, 'regressed'), g('RFC', 2, 'ready')])?.code).toBe('MC')
    expect(nextGate([g('MC', 1, 'approved'), g('RFC', 2, 'approved_with_conditions')])).toBeNull()
  })

  it('estado de la fila', () => {
    expect(rowState([g('MC', 1, 'approved'), g('RFC', 2, 'ready')])).toBe('ready')
    expect(rowState([g('MC', 1, 'pending_signatures')])).toBe('signing')
    expect(rowState([g('MC', 1, 'approved_needs_review')])).toBe('regressed')
    expect(rowState([g('MC', 1, 'approved')])).toBe('done')
    expect(rowState([g('MC', 1, 'not_ready')])).toBe('blocked')
    // A47 · E4: «no listo» según su causa; sin causa (gate guardado antes de E4) sigue bloqueado
    expect(rowState([g('MC', 1, 'not_ready', { work_state: 'nodata' })])).toBe('nodata')
    expect(rowState([g('MC', 1, 'not_ready', { work_state: 'work' })])).toBe('working')
    expect(rowState([g('MC', 1, 'not_ready', { work_state: 'blocked' })])).toBe('blocked')
  })

  it('número del bloqueo según el criterio', () => {
    expect(blockerCount({ kind: 'itr_phase_approved', label: null, detail: { itr_total: 10, itr_approved: 7 } })).toBe(3)
    expect(blockerCount({ kind: 'dependencies_ready', label: null, detail: { missing_count: 2 } })).toBe(2)
    expect(blockerCount({ kind: 'lineup_verified', label: null, detail: { missing: true } })).toBeNull()
    expect(blockerCount(null)).toBeNull()
  })

  it('filtros y orden por riesgo', () => {
    const rows = [
      row('S1', [g('MC', 1, 'approved')]),
      row('S2', [g('MC', 1, 'not_ready')], 'A2'),
      row('S3', [g('MC', 1, 'regressed')]),
      row('S4', [g('MC', 1, 'ready')]),
    ]
    const ctx = { commitment: (s: string) => (s === 's-S2' ? '2026-10-25' : null), changedIds: new Set(['s-S4']), today: '2026-10-20' }
    expect(filterMatrix(rows, parseMatrixFilters({}), ctx).map(r => r.system_code)).toEqual(['S3', 'S2', 'S4', 'S1'])
    expect(filterMatrix(rows, parseMatrixFilters({ area: 'A2' }), ctx).map(r => r.system_code)).toEqual(['S2'])
    expect(filterMatrix(rows, parseMatrixFilters({ state: 'ready' }), ctx).map(r => r.system_code)).toEqual(['S4'])
    expect(filterMatrix(rows, parseMatrixFilters({ committed: '7' }), ctx).map(r => r.system_code)).toEqual(['S2'])
    expect(filterMatrix(rows, parseMatrixFilters({ committed: '3' }), ctx)).toEqual([])
    expect(filterMatrix(rows, parseMatrixFilters({ changed: '1' }), ctx).map(r => r.system_code)).toEqual(['S4'])
    expect(filterMatrix(rows, parseMatrixFilters({ q: 's1' }), ctx).map(r => r.system_code)).toEqual(['S1'])
    expect(filterMatrix(rows, parseMatrixFilters({ blocked: '1' }), ctx).map(r => r.system_code)).toEqual(['S3', 'S2'])
    const two = [row('T1', [g('MC', 1, 'approved'), g('RFC', 2, 'not_ready')]), row('T2', [g('MC', 1, 'not_ready'), g('RFC', 2, 'not_ready')])]
    expect(filterMatrix(two, parseMatrixFilters({ gate: 'RFC' }), ctx).map(r => r.system_code)).toEqual(['T1'])
    expect(parseMatrixFilters({ state: 'bogus', committed: '-4', sort: 'x' })).toMatchObject({ state: undefined, committedDays: undefined, sort: 'risk' })
  })

  it('readiness único: aprobados vigentes / total (regresión y «por revisar» no cuentan)', () => {
    expect(readinessSummary([
      [g('MC', 1, 'approved'), g('RFC', 2, 'regressed')],
      [g('MC', 1, 'approved_with_conditions'), g('RFC', 2, 'approved_needs_review')],
    ])).toEqual({ done: 2, total: 4, pct: 0.5 })
  })
})
