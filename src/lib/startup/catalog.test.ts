import { describe, expect, it } from 'vitest'
import { PROCEDURE_SECTIONS, canReleaseHold, lineupItemState, lineupProgress, nextRunStep, runProgress } from './catalog'

describe('arranque — procedimientos', () => {
  it('15 secciones en el orden del catálogo (= procedure_section_keys en SQL)', () => {
    expect(PROCEDURE_SECTIONS).toHaveLength(15)
    expect(PROCEDURE_SECTIONS[10]).toBe('sequence')
  })

  it('liberar hold point: capacidad del rol y otra persona', () => {
    expect(canReleaseHold('leader', 'commissioning', 'u2', 'u1')).toBe(true)
    expect(canReleaseHold('client', 'commissioning', 'u2', 'u1')).toBe(false)
    expect(canReleaseHold('client', 'operations', 'u2', 'u1')).toBe(true)
    expect(canReleaseHold('owner', 'hse', 'u1', 'u1')).toBe(false)
  })

  it('siguiente paso: el primero pendiente; nada mientras hay un hold point', () => {
    const steps = [{ ord: 1, status: 'done' as const }, { ord: 2, status: 'pending' as const }, { ord: 3, status: 'pending' as const }]
    expect(nextRunStep(steps)?.ord).toBe(2)
    expect(nextRunStep([{ ord: 1, status: 'at_hold' as const }, { ord: 2, status: 'pending' as const }])).toBeNull()
    expect(runProgress([{ status: 'done' }, { status: 'na' }, { status: 'released' }, { status: 'pending' }])).toEqual({ closed: 3, total: 4 })
  })
})

describe('arranque — line-up', () => {
  const base = { required_position: 'closed' as const, found_position: null, is_critical: false, set_at: null, verified_at: null }
  it('estados de fila', () => {
    expect(lineupItemState(base)).toBe('pending')
    expect(lineupItemState({ ...base, found_position: 'open', set_at: 'x' })).toBe('misaligned')
    expect(lineupItemState({ ...base, found_position: 'closed', set_at: 'x' })).toBe('aligned')
    expect(lineupItemState({ ...base, is_critical: true, found_position: 'closed', set_at: 'x' })).toBe('to_verify')
    expect(lineupItemState({ ...base, is_critical: true, found_position: 'closed', set_at: 'x', verified_at: 'y' })).toBe('verified')
  })

  it('progreso y completitud', () => {
    const p = lineupProgress([
      { ...base, found_position: 'closed', set_at: 'x' },
      { ...base, is_critical: true, found_position: 'closed', set_at: 'x' },
      { ...base, found_position: 'open', set_at: 'x' },
    ])
    expect(p).toMatchObject({ total: 3, done: 1, toVerify: 1, misaligned: 1, complete: false })
    expect(lineupProgress([]).complete).toBe(false)
  })
})
