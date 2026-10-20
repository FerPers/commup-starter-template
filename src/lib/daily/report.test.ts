import { describe, expect, it } from 'vitest'
import { cutInUtc, progressDelta, reportFacts, reportTotals, type ReportData } from './report'

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

describe('reporte diario — totales y zona horaria (S10)', () => {
  it('usa el total de la BD y no el largo de la lista recortada a 30 (D-06)', () => {
    const d: ReportData = {
      ...base, timezone: 'America/Bogota',
      itrs: { ...base.itrs, approved_today_count: 200 },
      actions: { ...base.actions, overdue_count: 45 },
    }
    expect(reportTotals(d).approvedToday).toBe(200)
    const txt = reportFacts(d)
    expect(txt).toContain('ITR: 200 aprobados hoy (se listan 1)')
    expect(txt).toContain('45 vencidas (se listan 0)')
    expect(txt).toContain('día local, zona America/Bogota')
  })

  it('reporte congelado antes de S10: total = largo de la lista y día cortado en UTC (D12)', () => {
    expect(reportTotals(base).approvedToday).toBe(1)
    expect(cutInUtc(base)).toBe(true)
    expect(cutInUtc({ ...base, timezone: 'America/Bogota' })).toBe(false)
  })

  it('las horas de los eventos de arranque salen en la zona del proyecto', () => {
    const d: ReportData = {
      ...base, timezone: 'America/Bogota',
      startup_events_today: [{ number: 'EVT-0001', kind: 'milestone', code: 'first_startup', title: 'Arranque', system: 'A100-S01',
        occurred_at: '2026-10-17T02:10:00+00:00', status: 'witnessed', params: [] }],
    }
    expect(reportFacts(d)).toContain('21:10 EVT-0001 HITO first_startup')
  })
})
