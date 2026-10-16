import { describe, expect, it } from 'vitest'
import { progressDelta, reportFacts, type ReportData } from './report'

const base: ReportData = {
  date: '2026-10-16',
  project: { code: 'DEMO-GLP', name: 'Planta GLP' },
  area: null,
  progress: { weighted_pct: 0.0357, prev_pct: null, prev_date: null, gates_approved: 0, gates_total: 56 },
  itrs: { completed_today: 2, in_progress: 5, approved_today: [{ number: 'E13B-0001', tag: 'PT-101', system: 'A100-S01' }] },
  punches: { raised_today: [], closed_today: 1, open_a: 1, open_b: 3 },
  gates: { approved_today: [], regressed: [{ system: 'A100-S02', gate: 'MC' }] },
  constraints: {
    open_by_level: { '1': 1, '2': 0, '3': 1, '4': 0 }, overdue: 1, new_today: [], escalated_today: [],
    open_high: [{ number: 'RES-0001', title: 'Falta aire', system: 'A100-S02', level: 3, need_date: '2026-10-10', impact: 'schedule', recovery: null }],
  },
  actions: { open: 4, verified_today: 0, overdue: [] },
  tqs: { issued_today: 1, answered_today: 0, overdue: 0, design_changes_today: 0 },
  registers_in_field: [{ number: 'BYP-0001', kind: 'bypass', status: 'active', title: 'Bypass PSH-101', system: 'A100-S01' }],
  lookahead_7d: [],
}

describe('reporte diario — hechos para la IA', () => {
  it('delta en puntos porcentuales', () => {
    expect(progressDelta(base.progress)).toBeNull()
    expect(progressDelta({ ...base.progress, weighted_pct: 0.0457, prev_pct: 0.0357, prev_date: '2026-10-15' })).toBe(1)
  })

  it('incluye los hechos con su sistema y nada inventado', () => {
    const txt = reportFacts(base)
    expect(txt).toContain('ponderado 3.6 % (sin snapshot previo)')
    expect(txt).toContain('E13B-0001 (PT-101) [A100-S01]')
    expect(txt).toContain('En regresión: A100-S02 MC')
    expect(txt).toContain('RES-0001 N3: Falta aire [A100-S02]')
    expect(txt).toContain('BYP-0001 (bypass, active)')
    expect(txt).toContain('(ninguno levantado hoy)')
    expect(txt).toContain('(nada comprometido)')
  })
})
