import { describe, expect, it } from 'vitest'
import { TABLE_PRESETS, reshapeTable, type SourceRow } from '@/lib/itr/table'
import { isOutdated, latestItr, rowResults } from './test-status'

const config = structuredClone(TABLE_PRESETS.find(p => p.id === 'ce_test')!.config)
const rows: SourceRow[] = [
  { key: 'e1', label: 'E-01', refs: { action: 'close', link: 'X' } },
  { key: 'e2', label: 'E-02', refs: { action: 'stop', link: 'T5s' } },
  { key: 'e3', label: 'E-03', refs: { action: 'alarm', link: 'X' } },
]

function value(cells: Array<Record<string, string | number | null>>) {
  const base = reshapeTable(config, null, rows.length, rows)
  return JSON.stringify({ ...base, rows: base.rows.map((row, i) => ({ ...row, cells: { ...row.cells, ...cells[i] } })) })
}

describe('estado de prueba C&E y loop check', () => {
  it('toma el ITR más reciente como vigente', () => {
    expect(latestItr([{ created_at: '2026-10-01', n: 1 }, { created_at: '2026-10-05', n: 2 }])?.n).toBe(2)
    expect(latestItr([])).toBeNull()
  })

  it('marca desactualizado si cambian filas o datos de la foto', () => {
    expect(isOutdated(rows, structuredClone(rows))).toBe(false)
    expect(isOutdated(rows, rows.slice(0, 2))).toBe(true)
    const changed = structuredClone(rows); changed[1].refs.link = 'T10s'
    expect(isOutdated(rows, changed)).toBe(true)
    expect(isOutdated(null, rows)).toBe(false)
  })

  it('da el resultado por efecto según la tabla del ITR', () => {
    const items = [{ id: 'i1', item_type: 'table', options: config }]
    const results = rowResults(items, [{ item_id: 'i1', value_text: value([
      { executed: 'Sí', feedback: 'pass', result: 'pass' },
      { executed: 'No', feedback: 'fail', result: 'fail' },
      {},
    ]) }], rows)
    expect(Object.fromEntries(results)).toEqual({ e1: 'pass', e2: 'fail', e3: 'pending' })
    expect(Object.fromEntries(rowResults(items, [], rows))).toEqual({ e1: 'pending', e2: 'pending', e3: 'pending' })
  })
})
