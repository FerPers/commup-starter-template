import { describe, expect, it } from 'vitest'
import { evaluateTable } from './table'
import { evaluateContinuity } from './continuity'
import { calibrationAdvisories } from './calibration-advisory'
import probes from './diagnostico-sondas.fixture.json'

/**
 * A45 (2026-10-24): las sondas del diagnóstico del núcleo ITR (docs/DIAGNOSTICO-CORE-ITR-2026-10-23.md, H1–H3 y H6)
 * como pruebas. Cada una afirma lo que el motor DEBERÍA hacer y corre con `it.fails`: pasa mientras el defecto siga
 * y se pone roja cuando la ola 1 / A36–A38 lo corrijan; ahí se quita el `.fails`. Las configuraciones son las de
 * los ítems reales (org DEMO, captura del 23-oct) y las capturas son sintéticas. El SQL (evaluate_itr_table /
 * evaluate_itr_continuity, el que usa la firma) se prueba igual en tests/db/itr-diagnostico-sondas.test.ts.
 */
const rejects = (r: { isComplete: boolean; hasFail: boolean }) => r.hasFail || !r.isComplete

describe('sondas del diagnóstico ITR (A45)', () => {
  // A36 (ola 1): el motor ya puede rechazarlo (`outcomes` en la selección, preset ce_test; casos en
  // table-acceptance.test.ts). Sigue `.fails` porque la fixture es la I30C v3 real, que aún no lo adopta: se quita
  // cuando la plantilla homologada (A41) reemplace esta configuración.
  it.fails('H1 · I30C v3 E.1: «Ejecutó la acción = No» con resultado conforme no se acepta', () => {
    const p = probes.inconsistentEffect
    const r = evaluateTable(p.options, JSON.stringify(p.input), p.sourceRows)
    expect(rejects(r), p.note).toBe(true)
  })

  // A37 (decisión de Luis 2026-10-24): la tolerancia la define el inspector y él califica; el motor no rechaza esta
  // captura, pero el formato la AVISA (error escrito ≠ lecturas y «conforme» fuera de su tolerancia).
  it('H2 · I10A v3 4.01: 12 / 99 / error 0 «conforme» no lo rechaza el motor, lo avisa el formato', () => {
    const p = probes.calibrationManual
    expect(rejects(evaluateTable(p.options, JSON.stringify(p.input))), p.note).toBe(false)
    const options = { ...p.options, advisory: { expected: 'expected', observed: 'observed', error: 'error', result: 'result', tolerance_item: '2.07', base_item: '2.08', span_items: ['2.02', '2.03'], base_modes: { '% del span': 'pct_span' }, adjust: null } }
    const items = [
      { id: 'lo', item_number: '2.02', item_type: 'number' }, { id: 'hi', item_number: '2.03', item_type: 'number' },
      { id: 'tol', item_number: '2.07', item_type: 'number' }, { id: 'base', item_number: '2.08', item_type: 'select' },
      { id: 't', item_number: '4.01', item_type: 'table', options },
    ]
    const answers: Record<string, object> = { lo: { value_numeric: 4 }, hi: { value_numeric: 20 }, tol: { value_numeric: 0.5 }, base: { value_option: '% del span' }, t: { value_text: JSON.stringify(p.input) } }
    const advice = calibrationAdvisories(items, id => answers[id]).t
    expect(Object.values(advice.rows).flat().map(i => i.code)).toContain('error_mismatch')
    expect(Object.values(advice.rows).flat().map(i => i.code)).toContain('pass_out_of_tolerance')
  })

  // La corrección puede ser del motor o de la plantilla homologada (resultado obligatorio, A41/A42): si es de la
  // plantilla, esta fixture se cambia por la revisión nueva y la prueba se queda como regresión. A36: el motor ya
  // tiene `decides` (resultado siempre obligatorio); falta que E10B lo adopte.
  it.fails('H3 · E10B v2 M.1: una tabla con el resultado vacío no queda completa', () => {
    const p = probes.optionalResult
    const r = evaluateTable(p.options, JSON.stringify(p.input))
    expect(r.isComplete, p.note).toBe(false)
  })

  // A38: el alcance lo fija un líder y queda en el ITR; el ejecutor ya no declara la cantidad.
  it('H6 · continuidad: un conductor declarado cuando el alcance fijado dice cuatro no queda completo', () => {
    const p = probes.continuitySelfDeclared
    const r = evaluateContinuity(JSON.stringify(p.input), { grouping: 'conductors', count: 4, shields: [] }, false)
    expect(r.isComplete, p.note).toBe(false)
    expect(r.scopeMismatch).toBe(true)
  })

  it('las capturas de las sondas son válidas para el motor actual (no fallan por estructura)', () => {
    for (const [p, r] of [
      [probes.inconsistentEffect, evaluateTable(probes.inconsistentEffect.options, JSON.stringify(probes.inconsistentEffect.input), probes.inconsistentEffect.sourceRows)],
      [probes.calibrationManual, evaluateTable(probes.calibrationManual.options, JSON.stringify(probes.calibrationManual.input))],
      [probes.optionalResult, evaluateTable(probes.optionalResult.options, JSON.stringify(probes.optionalResult.input))],
    ] as const) {
      expect(r.errors, p.template).toEqual([])
    }
    expect(evaluateContinuity(JSON.stringify(probes.continuitySelfDeclared.input), { grouping: 'conductors', count: 1, shields: [] }, false).errors).toEqual([])
  })
})
