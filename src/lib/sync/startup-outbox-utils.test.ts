import { describe, expect, it } from 'vitest'
import {
  coalesceLineupSet, inScope, isHeld, networkActionsAllowed, nextSendable, overlayLineup, overlayRun, settle,
  type StartupEntry,
} from './startup-outbox-utils'

const T0 = '2026-10-16T10:00:00.000Z'
const step = (id: number, ord: number, extra: Partial<StartupEntry & { kind: 'run_step' }> = {}): StartupEntry => ({
  id, kind: 'run_step', projectId: 'p', runId: 'r1', stepId: `s${ord}`, ord, isHold: false, na: false, actual: null, comment: null,
  capturedAt: T0, state: 'pending', ...extra,
} as StartupEntry)
const stop = (id: number, extra: Partial<StartupEntry> = {}): StartupEntry => ({
  id, kind: 'run_stop', projectId: 'p', runId: 'r1', comment: 'presión alta', capturedAt: T0, state: 'pending', ...extra,
} as StartupEntry)
const lset = (id: number, itemId: string, extra: Partial<StartupEntry & { kind: 'lineup_set' }> = {}): StartupEntry => ({
  id, kind: 'lineup_set', projectId: 'p', sheetId: 'sh1', itemId, found: 'closed', remarks: null,
  expectedSetAt: null, expectedVerifiedAt: null, capturedAt: T0, state: 'pending', ...extra,
} as StartupEntry)

describe('orden de replay', () => {
  it('envía en orden de captura', () => {
    expect(nextSendable([step(3, 3), step(1, 1), step(2, 2)])?.id).toBe(1)
  })

  it('un paso rechazado retiene los posteriores de la misma ejecución, no los de otra', () => {
    const all = [step(1, 1, { state: 'rejected', error: 'La ejecución no está en curso (stopped)' }), step(2, 2), step(3, 1, { runId: 'r2' })]
    expect(isHeld(all[1], all)).toBe(true)
    expect(isHeld(all[2], all)).toBe(false)
    expect(nextSendable(all)?.id).toBe(3)
  })

  it('Detener nunca queda retenido (es seguridad)', () => {
    const all = [step(1, 1, { state: 'rejected' }), step(2, 2), stop(3)]
    expect(isHeld(all[2], all)).toBe(false)
    expect(nextSendable(all)?.id).toBe(3)
  })

  it('un conflicto de line-up no bloquea otras filas', () => {
    const all = [lset(1, 'i1', { state: 'conflict' }), lset(2, 'i2')]
    expect(nextSendable(all)?.id).toBe(2)
  })

  it('sin pendientes enviables no hay nada que enviar', () => {
    expect(nextSendable([step(1, 1, { state: 'rejected' }), step(2, 2)])).toBeNull()
  })
})

describe('resultado del servidor', () => {
  it('éxito o redundante → se quita de la bandeja', () => {
    expect(settle({ ok: true })).toEqual({ remove: true })
    expect(settle({ ok: true, redundant: true })).toEqual({ remove: true })
  })
  it('rechazo → queda visible, sin reintento automático', () => {
    expect(settle({ error: 'El paso 2 ya fue registrado' })).toEqual({ remove: false, patch: { state: 'rejected', error: 'El paso 2 ya fue registrado', remote: null } })
  })
  it('compare-and-set fallido → conflicto con el estado remoto', () => {
    const remote = { found: 'open' as const, setBy: 'u2', setAt: T0, verifiedBy: 'u3', verifiedAt: T0 }
    expect(settle({ error: 'cambió', conflict: remote })).toEqual({ remove: false, patch: { state: 'conflict', error: 'cambió', remote } })
  })
})

describe('re-fijar una fila encolada', () => {
  it('sin captura previa usa lo que vio el dispositivo', () => {
    const op = { ...lset(0, 'i1', { expectedSetAt: 'A' }) } as StartupEntry & { kind: 'lineup_set' }
    expect(coalesceLineupSet([], op)).toEqual({ replaceId: null, op })
  })
  it('reemplaza la pendiente y conserva su base de compare-and-set', () => {
    const prev = lset(4, 'i1', { found: 'open', expectedSetAt: 'A', expectedVerifiedAt: 'V' })
    const op = lset(0, 'i1', { found: 'closed', expectedSetAt: 'ignorado', expectedVerifiedAt: null }) as StartupEntry & { kind: 'lineup_set' }
    const r = coalesceLineupSet([prev, lset(5, 'i2')], op)
    expect(r.replaceId).toBe(4)
    expect(r.op).toMatchObject({ found: 'closed', expectedSetAt: 'A', expectedVerifiedAt: 'V' })
  })
  it('tras un conflicto, la nueva base es el estado remoto que el usuario vio', () => {
    const prev = lset(4, 'i1', { state: 'conflict', force: false, remote: { found: 'open', setBy: 'u2', setAt: 'R', verifiedBy: null, verifiedAt: 'RV' } })
    const r = coalesceLineupSet([prev], lset(0, 'i1') as StartupEntry & { kind: 'lineup_set' })
    expect(r.op).toMatchObject({ expectedSetAt: 'R', expectedVerifiedAt: 'RV', force: false })
  })
})

describe('vista local de la ejecución', () => {
  const base = [1, 2, 3].map(ord => ({ stepId: `s${ord}`, ord, status: 'pending' as const, actual: null, comment: null, doneBy: null, doneAt: null }))
  const run = { status: 'in_progress', stopReason: null }

  it('aplica los pasos pendientes con la hora de campo y quién', () => {
    const ov = overlayRun(run, base, [step(1, 1, { actual: '4 bar' })], 'u1')
    expect(ov.steps[0]).toMatchObject({ status: 'done', actual: '4 bar', doneBy: 'u1', doneAt: T0, sync: 'pending' })
    expect(ov.steps[1].sync).toBeUndefined()
    expect(ov).toMatchObject({ status: 'in_progress', locked: false, pending: 1 })
  })

  it('llegar a un hold point sin red deja la ejecución esperando liberación', () => {
    const ov = overlayRun(run, base, [step(1, 1), step(2, 2, { isHold: true })], 'u1')
    expect(ov.steps[1].status).toBe('at_hold')
    expect(ov.status).toBe('at_hold')
  })

  it('N/A pendiente', () => {
    expect(overlayRun(run, base, [step(1, 1, { na: true, comment: 'sin bomba' })], 'u1').steps[0].status).toBe('na')
  })

  it('Detener pendiente detiene en local con su motivo', () => {
    const ov = overlayRun(run, base, [stop(1)], 'u1')
    expect(ov).toMatchObject({ status: 'stopped', stopReason: 'presión alta' })
  })

  it('no pisa lo que el servidor ya registró ni cambia una ejecución cerrada', () => {
    const server = base.map(s => (s.ord === 1 ? { ...s, status: 'done' as const, doneBy: 'u2' } : s))
    const ov = overlayRun({ status: 'completed', stopReason: null }, server, [step(1, 1), stop(2)], 'u1')
    expect(ov.steps[0]).toMatchObject({ doneBy: 'u2' })
    expect(ov.status).toBe('completed')
  })

  it('un rechazo bloquea la captura y no aplica lo retenido', () => {
    const ov = overlayRun(run, base, [step(1, 1, { state: 'rejected' }), step(2, 2)], 'u1')
    expect(ov.locked).toBe(true)
    expect(ov.steps.every(s => s.status === 'pending')).toBe(true)
  })
})

describe('vista local del line-up', () => {
  const items = [
    { id: 'i1', found_position: 'open' as const, remarks: null, set_by: 'u2', set_at: 'A', verified_by: 'u3', verified_at: 'V' },
    { id: 'i2', found_position: null, remarks: null, set_by: null, set_at: null, verified_by: null, verified_at: null },
  ]
  it('re-fijar en local borra la verificación (como el servidor)', () => {
    const [i1] = overlayLineup(items, [lset(1, 'i1', { found: 'closed' })], 'u1')
    expect(i1).toMatchObject({ found_position: 'closed', set_by: 'u1', set_at: T0, verified_by: null, verified_at: null, sync: 'pending' })
  })
  it('una fila en conflicto conserva el estado del servidor', () => {
    const [i1] = overlayLineup(items, [lset(1, 'i1', { state: 'conflict' })], 'u1')
    expect(i1).toMatchObject({ found_position: 'open', verified_by: 'u3', sync: 'conflict' })
  })
})

describe('ámbito y acciones que exigen red', () => {
  it('filtra por ejecución u hoja', () => {
    expect(inScope(step(1, 1), { runId: 'r1' })).toBe(true)
    expect(inScope(stop(1), { runId: 'r2' })).toBe(false)
    expect(inScope(lset(1, 'i1'), { sheetId: 'sh1' })).toBe(true)
    expect(inScope(lset(1, 'i1'), { runId: 'r1' })).toBe(false)
  })
  it('liberar / verificar / completar: con red y bandeja vacía', () => {
    expect(networkActionsAllowed(true, 0)).toBe(true)
    expect(networkActionsAllowed(false, 0)).toBe(false)
    expect(networkActionsAllowed(true, 1)).toBe(false)
  })
})
