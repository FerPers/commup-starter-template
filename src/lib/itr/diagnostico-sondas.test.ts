import { describe, expect, it } from 'vitest'
import { evaluateTable } from './table'
import { evaluateContinuity } from './continuity'
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

  it.fails('H2 · I10A v3 4.01: salida esperada 12, observada 99 y error manual 0 no pasa como conforme', () => {
    const p = probes.calibrationManual
    const r = evaluateTable(p.options, JSON.stringify(p.input))
    expect(rejects(r), p.note).toBe(true)
  })

  // La corrección puede ser del motor o de la plantilla homologada (resultado obligatorio, A41/A42): si es de la
  // plantilla, esta fixture se cambia por la revisión nueva y la prueba se queda como regresión. A36: el motor ya
  // tiene `decides` (resultado siempre obligatorio); falta que E10B lo adopte.
  it.fails('H3 · E10B v2 M.1: una tabla con el resultado vacío no queda completa', () => {
    const p = probes.optionalResult
    const r = evaluateTable(p.options, JSON.stringify(p.input))
    expect(r.isComplete, p.note).toBe(false)
  })

  // Hoy el evaluador solo recibe la captura: la cantidad la declara el mismo ejecutor. La firma de abajo (cantidad
  // de ingeniería, D.4 o listado de conductores) es provisional hasta la política de A38.
  it.fails('H6 · continuidad: un conductor declarado cuando ingeniería dice cuatro no queda completo', () => {
    const p = probes.continuitySelfDeclared
    const evaluateAgainst = evaluateContinuity as (value: string, engineering: { expectedCount: number }) => ReturnType<typeof evaluateContinuity>
    const r = evaluateAgainst(JSON.stringify(p.input), { expectedCount: 4 })
    expect(r.isComplete, p.note).toBe(false)
  })

  it('las capturas de las sondas son válidas para el motor actual (no fallan por estructura)', () => {
    for (const [p, r] of [
      [probes.inconsistentEffect, evaluateTable(probes.inconsistentEffect.options, JSON.stringify(probes.inconsistentEffect.input), probes.inconsistentEffect.sourceRows)],
      [probes.calibrationManual, evaluateTable(probes.calibrationManual.options, JSON.stringify(probes.calibrationManual.input))],
      [probes.optionalResult, evaluateTable(probes.optionalResult.options, JSON.stringify(probes.optionalResult.input))],
    ] as const) {
      expect(r.errors, p.template).toEqual([])
    }
    expect(evaluateContinuity(JSON.stringify(probes.continuitySelfDeclared.input)).errors).toEqual([])
  })
})
