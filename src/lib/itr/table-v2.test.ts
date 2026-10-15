import { describe, expect, it } from 'vitest'
import { TABLE_PRESETS, checkTableConfig, deviation, evaluateTable, reshapeTable, type TableConfig } from './table'

// Tabla v2 (fase 4 · bloque C): desviación calculada, tolerancia, resultado automático,
// as found / as left y series con estabilidad. Espejo de evaluate_itr_table (migración 20261016180000).

const preset = (id: string) => structuredClone(TABLE_PRESETS.find(p => p.id === id)!.config)

function configured(id: string, patch: (c: TableConfig) => void): TableConfig {
  const c = preset(id)
  patch(c)
  expect(checkTableConfig(c).issue).toBeNull()
  return c
}

function capture(config: TableConfig, count: number, rows: Record<string, unknown>[]) {
  const cap = reshapeTable(config, null, count)
  cap.rows.forEach((row, i) => Object.assign(row.cells, rows[i] ?? {}))
  return JSON.stringify(cap)
}

const calib = () => configured('calibration_auto', c => {
  const err = c.columns.find(x => x.key === 'error')!
  err.formula!.span = 16
  err.tolerance = 0.25
})

describe('desviación', () => {
  it('absoluta, % del span y % de la lectura', () => {
    expect(deviation({ observed: 'o', reference: 'r', mode: 'abs', span: null }, 12.1, 12)).toBeCloseTo(0.1)
    expect(deviation({ observed: 'o', reference: 'r', mode: 'pct_span', span: 16 }, 12.04, 12)).toBeCloseTo(0.25)
    expect(deviation({ observed: 'o', reference: 'r', mode: 'pct_reading', span: null }, 101, 100)).toBeCloseTo(1)
    expect(deviation({ observed: 'o', reference: 'r', mode: 'pct_reading', span: null }, 1, 0)).toBeNull()
    expect(deviation({ observed: 'o', reference: 'r', mode: 'abs', span: null }, null, 1)).toBeNull()
  })
})

describe('calibración con resultado automático', () => {
  it('calcula error y ✓/✗ e ignora lo que mande el cliente', () => {
    const c = calib()
    const base = { input: 0, expected: 4, observed: 4 }
    const rows: Record<string, unknown>[] = c.rows.mode === 'fixed' ? c.rows.labels.map(() => ({ ...base })) : []
    rows[2] = { input: 50, expected: 12, observed: 12.1, error: 0, result: 'pass' } // 0,625 % del span > 0,25
    const r = evaluateTable(c, capture(c, 9, rows))
    expect(r.isComplete).toBe(true)
    expect(r.hasFail).toBe(true)
    expect(r.data!.rows[2].cells.error).toBeCloseTo(0.625)
    expect(r.data!.rows[2].cells.result).toBe('fail')
    expect(r.data!.rows[0].cells.result).toBe('pass')
    expect(r.rowFlags.R3.fail).toBe(true)
  })

  it('en el límite exacto de la tolerancia acepta', () => {
    const c = calib()
    const rows = Array.from({ length: 9 }, () => ({ input: 0, expected: 12, observed: 12.04 })) // 0,25 %
    const r = evaluateTable(c, capture(c, 9, rows))
    expect(r.hasFail).toBe(false)
  })

  it('sin lectura observada, el resultado queda pendiente y la tabla incompleta', () => {
    const c = calib()
    const r = evaluateTable(c, capture(c, 9, [{ input: 0, expected: 4 }]))
    expect(r.isComplete).toBe(false)
    expect(r.data!.rows[0].cells.result).toBe('')
  })
})

describe('as found / as left', () => {
  const c = () => configured('as_found_left', cfg => {
    for (const k of ['found_error', 'left_error']) {
      const col = cfg.columns.find(x => x.key === k)!
      col.formula!.span = 16
      col.tolerance = 0.5
    }
  })
  it('as found fuera de tolerancia solo se marca; se acepta por as left', () => {
    const rows = Array.from({ length: 5 }, () => ({ input: 0, expected: 12, found: 12.4, left: 12.02 })) // 2,5 % / 0,125 %
    const r = evaluateTable(c(), capture(c(), 5, rows))
    expect(r.hasFail).toBe(false)
    expect(r.asFoundOut).toBe(5)
    expect(r.rowFlags.R1).toEqual({ fail: false, asFoundOut: true })
    expect(r.data!.rows[0].cells.result).toBe('pass')
  })
  it('as left fuera de tolerancia rechaza', () => {
    const rows = Array.from({ length: 5 }, () => ({ input: 0, expected: 12, found: 12, left: 12.2 }))
    expect(evaluateTable(c(), capture(c(), 5, rows)).hasFail).toBe(true)
  })
})

describe('serie de lecturas con estabilidad', () => {
  const c = () => configured('reading_series', cfg => { cfg.stability!.max = -40 })
  const reading = (v: number, i: number) => ({ at: `2026-10-15T0${i}:00`, value: v })
  it('pide al menos N lecturas', () => {
    const r = evaluateTable(c(), capture(c(), 2, [reading(-45, 1), reading(-46, 2)]))
    expect(r.isComplete).toBe(false)
    expect(r.stability).toEqual({ ok: null, needed: 3, have: 2 })
  })
  it('las primeras pueden estar fuera; las últimas N deciden', () => {
    const ok = evaluateTable(c(), capture(c(), 5, [reading(-20, 1), reading(-35, 2), reading(-41, 3), reading(-42, 4), reading(-43, 5)]))
    expect(ok).toMatchObject({ isComplete: true, hasFail: false, stability: { ok: true } })
    const bad = evaluateTable(c(), capture(c(), 4, [reading(-41, 1), reading(-42, 2), reading(-39, 3), reading(-43, 4)]))
    expect(bad.hasFail).toBe(true)
  })
  it('fecha y hora con formato inválido invalida el registro', () => {
    expect(evaluateTable(c(), capture(c(), 3, [{ at: 'ayer', value: -50 }])).data).toBeNull()
  })
})

describe('validación de la configuración v2', () => {
  it('explica qué falta y rechaza referencias inválidas', () => {
    expect(checkTableConfig(preset('calibration_auto')).issue).toMatch(/span/)
    const noTol = configured('calibration_auto', cfg => { cfg.columns.find(x => x.key === 'result')!.auto_from = null; cfg.columns.find(x => x.key === 'error')!.formula!.span = 16 })
    expect(noTol.columns.find(x => x.key === 'error')!.tolerance).toBeNull()
    const v1 = { version: 1, rows: { mode: 'fixed', labels: ['x'] }, columns: [{ key: 'a', label: 'A', type: 'datetime' }] }
    expect(checkTableConfig(v1).issue).toMatch(/versión 2/)
    const badRef = { version: 2, rows: { mode: 'fixed', labels: ['x'] }, columns: [
      { key: 'a', label: 'A', type: 'text' }, { key: 'b', label: 'B', type: 'number' },
      { key: 'e', label: 'E', type: 'computed', formula: { observed: 'a', reference: 'b', mode: 'abs' } },
    ] }
    expect(checkTableConfig(badRef).issue).toMatch(/columnas numéricas/)
    const fromFound = configured('as_found_left', cfg => { for (const k of ['found_error', 'left_error']) { const x = cfg.columns.find(y => y.key === k)!; x.formula!.span = 16; x.tolerance = 1 } })
    fromFound.columns.find(x => x.key === 'result')!.auto_from = 'found_error'
    expect(checkTableConfig(fromFound).issue).toMatch(/as found/)
  })
})
