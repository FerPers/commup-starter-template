import { describe, expect, it } from 'vitest'
import {
  PERFORMANCE_SECTIONS, checkContent, checkCriterion, checkVariables, criterionText, emptyCriterion, emptyVariable,
  canSignCertificate, findCycle, runClock, toPayload, type ContentDraft,
} from './catalog'

const v = (key: string, source: 'signal' | 'manual' | 'derived', a = '', b = '') =>
  ({ ...emptyVariable(source), key, label: key, signal_id: source === 'signal' ? 'sig-' + key : null, operand_a: a, operand_b: b })

describe('performance catalog', () => {
  it('mantiene las 8 secciones de performance_section_keys()', () => {
    expect(PERFORMANCE_SECTIONS).toEqual(['purpose', 'boundary', 'conditions', 'method', 'corrections', 'uncertainty', 'references', 'responsibilities'])
  })

  it('valida claves, señales y operandos', () => {
    expect(checkVariables([v('F1', 'signal'), v('KW', 'manual'), v('ESP', 'derived', 'KW', 'F1')])).toBeNull()
    expect(checkVariables([v('1A', 'manual')])).toMatch(/Clave no válida/)
    expect(checkVariables([v('A', 'manual'), v('a', 'manual')])).toMatch(/repetida/)
    expect(checkVariables([{ ...v('P', 'signal'), signal_id: null }])).toMatch(/necesita una señal/)
    expect(checkVariables([v('X', 'derived', 'A', 'B')])).toMatch(/no existe/)
    expect(checkVariables([{ ...v('KW', 'manual'), manual_every_min: '0' }])).toMatch(/1 a 1440/)
  })

  it('detecta ciclos directos e indirectos', () => {
    expect(findCycle([v('M', 'manual'), v('X', 'derived', 'Y', 'M'), v('Y', 'derived', 'X', 'M')])).toBe('X')
    expect(findCycle([v('X', 'derived', 'X', 'X')])).toBe('X')
    expect(findCycle([v('M', 'manual'), v('X', 'derived', 'M', 'M'), v('Y', 'derived', 'X', 'M')])).toBeNull()
  })

  it('valida criterios como los CHECK de la BD', () => {
    const keys = new Set(['F1'])
    expect(checkCriterion({ ...emptyCriterion('F1'), target: '17,5' }, keys)).toBeNull()
    expect(checkCriterion({ ...emptyCriterion('F2'), target: '1' }, keys)).toMatch(/variable/)
    expect(checkCriterion({ ...emptyCriterion('F1'), operator: 'between', target: '5', target_hi: '4' }, keys)).toMatch(/rango/)
    expect(checkCriterion({ ...emptyCriterion('F1'), statistic: 'pct_in_band', target: '95' }, keys)).toMatch(/banda/)
    expect(checkCriterion({ ...emptyCriterion('F1'), statistic: 'pct_in_band', band_lo: '11', target: '120' }, keys)).toMatch(/0 a 100/)
  })

  it('arma el payload con números y claves normalizadas', () => {
    const c: ContentDraft = {
      sections: { purpose: ' Capacidad ', boundary: '' },
      settings: { stabilization_min: '30', formal_min: '360', sample_interval_s: '60', min_coverage_pct: '90', procedure_id: '' },
      system_ids: ['s1'],
      variables: [v('f1', 'signal'), { ...v('esp', 'derived', 'f1', 'f1'), op: '/' }],
      criteria: [{ ...emptyCriterion('f1'), target: '17,5', uncertainty: '1', uncertainty_mode: 'pct' }],
      pairs: [],
    }
    expect(checkContent(c)).toBeNull()
    const p = toPayload(c)
    expect(p.sections).toEqual({ purpose: 'Capacidad' })
    expect(p.settings.procedure_id).toBeNull()
    expect(p.variables[1]).toMatchObject({ key: 'ESP', operand_a: 'F1', signal_id: null, op: '/', manual_every_min: 60 })
    expect(p.criteria[0]).toMatchObject({ variable_key: 'F1', target: 17.5, target_hi: null, band_lo: null, total_basis: null, uncertainty: 1 })
    expect(criterionText(c.criteria[0], 'MMSCFD')).toBe('prom(F1) ≥ 17,5 MMSCFD ± 1 %')
  })

  it('calcula el reloj del intento', () => {
    const t0 = Date.parse('2026-10-17T10:00:00Z')
    const rev = { stabilization_min: 30, formal_min: 60 }
    const base = { stabilization_started_at: '2026-10-17T10:00:00Z', formal_started_at: null, closed_at: null }
    expect(runClock({ ...base, status: 'stabilizing' }, rev, t0 + 10 * 60000)).toMatchObject({ elapsedMin: 10, remainingMin: 20, done: false })
    const formal = { ...base, status: 'formal' as const, formal_started_at: '2026-10-17T10:40:00Z' }
    expect(runClock(formal, rev, t0 + 105 * 60000)).toMatchObject({ phase: 'formal', elapsedMin: 65, remainingMin: 0, done: true })
    expect(runClock({ ...formal, status: 'closed', closed_at: '2026-10-17T11:20:00Z' }, rev, t0)).toMatchObject({ elapsedMin: 40 })
  })
})

describe('firmas del certificado PTC', () => {
  const c = { status: 'pending_signatures' as const, commissioning_signed_by: 'a', operations_signed_by: null, client_signed_by: null }
  it('exige otra persona y la capacidad correcta', () => {
    expect(canSignCertificate(c, 'operations', 'leader', 'a')).toBe(false)
    expect(canSignCertificate(c, 'operations', 'leader', 'b')).toBe(true)
    expect(canSignCertificate(c, 'operations', 'inspector', 'b')).toBe(false)
    expect(canSignCertificate(c, 'client', 'admin', 'b')).toBe(false)
    expect(canSignCertificate(c, 'client', 'client', 'c')).toBe(true)
    expect(canSignCertificate({ ...c, operations_signed_by: 'c' }, 'client', 'client', 'c')).toBe(false)
    expect(canSignCertificate({ ...c, status: 'accepted' }, 'client', 'client', 'd')).toBe(false)
  })
})
