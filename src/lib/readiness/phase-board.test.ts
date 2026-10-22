import { describe, expect, it } from 'vitest'
import type { GateBlocker, GateStatus, MatrixGate } from './gates'
import type { MatrixRow } from './matrix'
import { blockedToday, buildPhaseBoard, upcomingWindow } from './phase-board'

const g = (code: string, order: number, status: GateStatus, blocker: GateBlocker | null = null): MatrixGate => ({
  gate_id: `g-${code}`, code, name: code, order, computed_level: 'red', status, failing: 0, approval: null, blocker,
})
const row = (code: string, gates: MatrixGate[]): MatrixRow => ({
  system_id: `s-${code}`, system_code: code, system_name: code, area_code: 'A', area_name: 'A', gates,
})
const catA: GateBlocker = { kind: 'itr_phase_approved', label: null, detail: {} }
const dep: GateBlocker = { kind: 'dependencies_ready', label: null, detail: {} }

describe('tablero por fases (N2b)', () => {
  const rows = [
    row('S1', [g('MC', 1, 'approved'), g('RFC', 2, 'not_ready', catA)]),
    row('S2', [g('MC', 1, 'not_ready', catA), g('RFC', 2, 'not_ready')]),
    row('S3', [g('MC', 1, 'regressed', dep), g('RFC', 2, 'not_ready')]),
    row('S4', [g('MC', 1, 'pending_signatures'), g('RFC', 2, 'not_ready')]),
  ]
  const ctx = {
    commitments: new Map([['s-S2:g-MC', '2026-10-30'], ['s-S4:g-MC', '2026-10-20'], ['s-S1:g-MC', '2026-09-01']]),
    forecasts: new Map([['s-S4:g-MC', '2026-10-25']]),
    today: '2026-10-22',
    gatePhase: new Map([['g-MC', 'ph-mc'], ['g-RFC', null]]),
    itrByPhase: new Map([['ph-mc', { approved: 7, total: 10 }]]),
  }

  it('una fila por gate con readiness, pendientes, ITR de la fase y compromiso más próximo sin aprobar', () => {
    const [mc, rfc] = buildPhaseBoard(rows, ctx)
    expect(mc).toMatchObject({ code: 'MC', approved: 1, total: 4, toSign: 1, regressed: 1, blocked: 2, itr: { approved: 7, total: 10 } })
    // S1 ya aprobó MC: su compromiso no cuenta; S4 venció el 20-oct.
    expect(mc.commitment).toMatchObject({ system_code: 'S4', date: '2026-10-20', forecast: '2026-10-25', late: true })
    expect(mc.topBlocker?.systems).toBe(1)
    expect(rfc).toMatchObject({ code: 'RFC', approved: 0, blocked: 1, itr: null, commitment: null })
    expect(rfc.topBlocker).toMatchObject({ kind: 'itr_phase_approved', systems: 1 })
  })

  it('lo que bloquea hoy: solo los que no avanzan, la regresión primero', () => {
    const out = blockedToday(rows, { commitment: () => null, today: ctx.today })
    expect(out.map(o => `${o.row.system_code}:${o.gate.code}`)).toEqual(['S3:MC', 'S2:MC', 'S1:RFC'])
  })

  it('próximos 7 días: lo vencido se muestra (salvo forecast), lo lejano no', () => {
    const items = upcomingWindow([
      { kind: 'commitment', date: '2026-10-20', ref: 'S4', title: 'MC', href: '#' },
      { kind: 'forecast', date: '2026-10-21', ref: 'S5', title: 'MC', href: '#' },
      { kind: 'action', date: '2026-10-29', ref: 'ACC-1', title: 'x', href: '#' },
      { kind: 'vendor', date: '2026-10-30', ref: 'VND-1', title: 'FAT', href: '#' },
    ], '2026-10-22')
    expect(items.map(i => i.ref)).toEqual(['S4', 'ACC-1'])
    expect(items[0].late).toBe(true)
  })
})
