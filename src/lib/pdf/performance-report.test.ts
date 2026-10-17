import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { Evaluation } from '@/lib/performance/catalog'
import { renderPerformancePdf, thinSeries, type PerformancePdfInput } from './performance-report'

const evaluation: Evaluation = {
  run: 'PTT-0001/R2', revision: 0, revision_hash: 'a'.repeat(64), computed_at: '2026-10-17T12:00:00Z',
  window: { from: '2026-10-17T10:10:00Z', to: '2026-10-17T16:10:00Z', total_min: 360, excluded_min: 20, valid_min: 340, formal_min: 360, min_coverage_pct: 90, early_close: false },
  variables: [
    { key: 'F1', label: 'Flujo entrada', unit: 'MMSCFD', source: 'signal', signal: 'FT-106', expected: 340, present: 338, coverage_pct: 99.4, coverage_ok: true, bad_pct: 0.2, spikes: 0, out_of_range: 0, unit_ok: true, evaluable: true },
    { key: 'KW', label: 'Potencia', unit: 'kW', source: 'manual', expected: 6, present: 6, coverage_pct: 100, coverage_ok: true, spikes: 0, unit_ok: true, evaluable: true },
    { key: 'ESP', label: 'Consumo específico', unit: 'kW/MMSCFD', source: 'derived', formula: 'KW / F1', present: 338, coverage_pct: 99.4, evaluable: true },
  ],
  criteria: [
    { ord: 1, variable_key: 'F1', label: 'Capacidad nominal', statistic: 'avg', band_lo: null, band_hi: null, total_basis: null, operator: 'gte', target: 17.5, target_hi: null, uncertainty: 1, uncertainty_mode: 'pct', value: 17.41, outcome: 'within_uncertainty' },
    { ord: 2, variable_key: 'ESP', label: null, statistic: 'avg', band_lo: null, band_hi: null, total_basis: null, operator: 'lte', target: 90, target_hi: null, uncertainty: 0, uncertainty_mode: 'abs', value: 83.2, outcome: 'pass' },
  ],
  pairs: [{ variable_a: 'F1', variable_b: 'F2', max_diff_pct: 5, diff_pct: 2.3, minutes: 338, ok: true }],
  reasons: [], suggested: 'accepted_with_deviation', result: 'accepted_with_deviation', result_reason: null,
}

const base: PerformancePdfInput = {
  lang: 'es', orgName: 'DEMO Refinería', projectCode: 'DEMO-GLP',
  test: { number: 'PTT-0001', title: 'Capacidad del compresor C-103' },
  run: { number: 'PTT-0001/R2', status: 'evaluated', stabilizationAt: '2026-10-17T09:10:00Z', formalAt: '2026-10-17T10:10:00Z', formalNote: null,
    closedAt: '2026-10-17T16:10:00Z', earlyClose: false, earlyReason: null, evaluationHash: 'b'.repeat(64), resultBy: 'Luis', resultAt: '2026-10-17T16:30:00Z' },
  revision: { rev: 0, hash: 'a'.repeat(64), stabilizationMin: 60, formalMin: 360, sampleIntervalS: 60, minCoveragePct: 90, approvedBy: 'Ana', approvedAt: '2026-10-16T12:00:00Z' },
  sections: { purpose: 'Demostrar la capacidad nominal.', boundary: 'Succión a descarga.', method: 'Carga estable 6 h.\nRegistro por minuto.' },
  primarySystem: 'A100-S02 — Compresión', systems: ['A100-S02'], procedure: 'PRC-0002 — Prueba de capacidad',
  variables: [
    { key: 'F1', label: 'Flujo entrada', source: 'signal', ref: 'FT-106', unit: 'MMSCFD', every: null },
    { key: 'KW', label: 'Potencia', source: 'manual', ref: '', unit: 'kW', every: 60 },
    { key: 'ESP', label: 'Consumo específico', source: 'derived', ref: 'KW / F1', unit: 'kW/MMSCFD', every: null },
  ],
  evaluation,
  disturbances: [{ start: '2026-10-17T12:00:00Z', end: '2026-10-17T12:20:00Z', kind: 'load_change', description: 'Cambio de carga', excluded: true, reason: 'Fuera de envolvente', by: 'Luis' }],
  series: [{ key: 'F1', unit: 'MMSCFD', points: Array.from({ length: 900 }, (_, i) => ({ t: Date.parse('2026-10-17T09:10:00Z') + i * 60000, v: 17.4 + Math.sin(i / 20) * 0.2 })) }],
  action: 'ACC-0076 — aceptada con desviación',
  certificate: { number: 'PTC-0001', status: 'pending_signatures', hash: null, signatures: [
    { capacity: 'commissioning', name: 'Luis', at: '2026-10-17T17:00:00Z' }, { capacity: 'operations', name: null, at: null }, { capacity: 'client', name: null, at: null }] },
  labels: { result: r => r, outcome: o => o, reason: r => r, source: s => s, distKind: k => k, certStatus: s => s, capacity: c => c },
}

describe('reporte de prueba de desempeño', () => {
  it('genera un PDF válido con las 14 secciones', async () => {
    const bytes = await renderPerformancePdf(base)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getTitle()).toContain('PTT-0001/R2')
  })

  it('genera el borrador sin resultado ni certificado, en inglés', async () => {
    const bytes = await renderPerformancePdf({ ...base, lang: 'en', certificate: null, action: null, series: [],
      run: { ...base.run, evaluationHash: null, resultBy: null }, evaluation: { ...evaluation, result: undefined, reasons: ['coverage'], suggested: 'inconclusive' } })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('reduce series largas', () => {
    expect(thinSeries(Array.from({ length: 900 }, (_, i) => i), 300).length).toBe(300)
    expect(thinSeries([1, 2, 3], 300)).toEqual([1, 2, 3])
  })
})
