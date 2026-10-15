import { describe, expect, it } from 'vitest'
import { TABLE_PRESETS, checkTableConfig, evaluateTable, parseSourceRows, reshapeTable, sourceRefText, type SourceRow, type TableConfig } from './table'

const preset = (id: string) => structuredClone(TABLE_PRESETS.find(p => p.id === id)!.config)

const effects: SourceRow[] = [
  { key: 'e1', label: 'E-01 · SDV-101', refs: { effect_code: 'E-01', effect_description: 'Cierre SDV', effect_tag: 'SDV-101', action: 'close', link: 'X' } },
  { key: 'e2', label: 'E-02 · P-101', refs: { effect_code: 'E-02', effect_description: 'Parada bomba', effect_tag: 'P-101', action: 'stop', link: 'T5s' } },
]

function capture(config: TableConfig, rows: SourceRow[], cells: Array<Record<string, string | number | null>>) {
  const base = reshapeTable(config, null, rows.length, rows)
  return JSON.stringify({ ...base, rows: base.rows.map((row, i) => ({ ...row, cells: { ...row.cells, ...cells[i] } })) })
}

describe('tabla con filas desde la foto del ITR (fase 4-D)', () => {
  it('los presets de loop check y prueba C&E son válidos', () => {
    expect(checkTableConfig(preset('loop_check')).issue).toBeNull()
    expect(checkTableConfig(preset('ce_test')).issue).toBeNull()
  })

  it('rechaza referencias de otro origen y referencias en filas fijas', () => {
    const wrong = preset('ce_test')
    wrong.columns[0] = { ...wrong.columns[0], ref: 'junction_box' }
    expect(checkTableConfig(wrong).issue).toMatch(/no es un dato/)
    const fixed = { ...preset('ce_test'), rows: { mode: 'fixed' as const, labels: ['a'] } }
    expect(checkTableConfig(fixed).issue).toMatch(/solo existen/)
    const v1 = { ...preset('ce_test'), version: 1 as const }
    expect(checkTableConfig(v1).issue).toMatch(/versión 2/)
  })

  it('arma las filas con la foto y muestra sus datos sin capturarlos', () => {
    const c = preset('ce_test')
    const value = capture(c, effects, [
      { executed: 'Sí', feedback: 'pass', result: 'pass', action: 'FALSO' },
      { executed: 'Sí', response_s: 5.2, feedback: 'pass', result: 'pass' },
    ])
    const r = evaluateTable(c, value, effects)
    expect(r.isComplete).toBe(true)
    expect(r.hasFail).toBe(false)
    expect(r.data!.rows.map(row => row.label)).toEqual(['E-01 · SDV-101', 'E-02 · P-101'])
    // Lo que envía el cliente en una columna de referencia no cuenta: se muestra la foto.
    expect(r.data!.rows[0].cells.action).toBe('Cerrar')
    expect(r.data!.rows[1].cells.link).toBe('T5s')
  })

  it('un efecto que falla rechaza; sin foto o con otra cantidad es inválido', () => {
    const c = preset('ce_test')
    const value = capture(c, effects, [{ executed: 'No', feedback: 'fail', result: 'fail' }, { executed: 'Sí', feedback: 'pass', result: 'pass' }])
    expect(evaluateTable(c, value, effects).hasFail).toBe(true)
    expect(evaluateTable(c, value, null).data).toBeNull()
    expect(evaluateTable(c, value, effects.slice(0, 1)).data).toBeNull()
  })

  it('lee la foto guardada en itrs.source_rows', () => {
    expect(parseSourceRows(null)).toBeNull()
    expect(parseSourceRows([{ key: 'a', label: 'PT-101', refs: { junction_box: 'JB-01', hmi_display: null } }])).toEqual([{ key: 'a', label: 'PT-101', refs: { junction_box: 'JB-01', hmi_display: null } }])
    expect(parseSourceRows([{ label: 'sin key' }])).toBeNull()
    expect(sourceRefText('action', 'trip')).toBe('Disparo')
    expect(sourceRefText('hmi_display', null)).toBe('—')
  })
})
