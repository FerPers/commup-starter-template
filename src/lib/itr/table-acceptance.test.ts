import { describe, expect, it } from 'vitest'
import { TABLE_PRESETS, checkTableConfig, evaluateTable } from './table'
import { ACCEPTANCE_CASES, ACCEPTANCE_CONFIGS } from './table-acceptance.cases'

// A36 (diagnóstico ITR H1/H3): qué columnas de una tabla deciden la aceptación. El SQL se compara con estos mismos
// casos en tests/db/itr-table-acceptance.test.ts.
describe('aceptación en tablas (A36)', () => {
  for (const [name, cfg, value, complete, fail] of ACCEPTANCE_CASES) {
    it(name, () => {
      const r = evaluateTable(ACCEPTANCE_CONFIGS[cfg], value)
      expect({ complete: r.isComplete, fail: r.hasFail }).toEqual({ complete, fail })
    })
  }

  it('las configuraciones inválidas explican por qué', () => {
    expect(checkTableConfig(ACCEPTANCE_CONFIGS.badOutcomeOption).issue).toMatch(/no es una de sus opciones/)
    expect(checkTableConfig(ACCEPTANCE_CONFIGS.badTwoDecides).issue).toMatch(/Solo una columna/)
    expect(checkTableConfig(ACCEPTANCE_CONFIGS.badDecidesOnSelect).issue).toMatch(/solo una columna de resultado/)
  })

  it('la columna que decide queda obligatoria aunque venga marcada opcional', () => {
    const cfg = checkTableConfig(ACCEPTANCE_CONFIGS.decidesOptional).config!
    expect(cfg.columns.find(c => c.key === 'result')).toMatchObject({ decides: true, required: true })
  })

  it('un resultado automático sin desviación calculable se informa', () => {
    const r = evaluateTable(ACCEPTANCE_CONFIGS.auto, JSON.stringify({ version: 1, count: 1, rows: [{ id: 'R1', label: 'x', cells: {} }] }))
    expect(r.errors).toContainEqual({ code: 'auto_result', row: '50 %', column: 'Resultado' })
  })

  it('el preset ce_test rechaza un efecto no ejecutado aunque el resultado diga conforme (H1)', () => {
    const preset = TABLE_PRESETS.find(p => p.id === 'ce_test')!.config
    expect(checkTableConfig(preset).issue).toBeNull()
    const sourceRows = [{ key: 'e1', label: 'Efecto 1', refs: {} }]
    const value = (executed: string) => JSON.stringify({ version: 1, count: 1, rows: [{ id: 'R1', label: 'Efecto 1', cells: { executed, feedback: 'pass', result: 'pass', remarks: '' } }] })
    expect(evaluateTable(preset, value('No'), sourceRows).hasFail).toBe(true)
    expect(evaluateTable(preset, value('Sí'), sourceRows)).toMatchObject({ isComplete: true, hasFail: false })
  })
})
