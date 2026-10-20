import { describe, expect, it } from 'vitest'
import { fallbackCapacities } from '@/lib/constants/capacities'
import { PROCEDURE_SECTIONS, canReleaseHold, lineupItemState, lineupProgress, nextRunStep, runProgress } from './catalog'

describe('arranque — procedimientos', () => {
  it('15 secciones en el orden del catálogo (= procedure_section_keys en SQL)', () => {
    expect(PROCEDURE_SECTIONS).toHaveLength(15)
    expect(PROCEDURE_SECTIONS[10]).toBe('sequence')
  })

  it('liberar hold point: capacidad del rol y otra persona', () => {
    expect(canReleaseHold(fallbackCapacities('leader'), 'commissioning', 'u2', 'u1')).toBe(true)
    expect(canReleaseHold(fallbackCapacities('client'), 'commissioning', 'u2', 'u1')).toBe(false)
    expect(canReleaseHold(fallbackCapacities('client'), 'operations', 'u2', 'u1')).toBe(true)
    expect(canReleaseHold(fallbackCapacities('owner'), 'hse', 'u1', 'u1')).toBe(false)
    // S14 (D14): un inspector designado para Operaciones libera su hold point.
    const designated = { ...fallbackCapacities('inspector'), operations: { allowed: true, designated: true } }
    expect(canReleaseHold(designated, 'operations', 'u2', 'u1')).toBe(true)
    expect(canReleaseHold(designated, 'hse', 'u2', 'u1')).toBe(false)
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

describe('arranque — bitácora', () => {
  it('testigo por hito y bloqueo duro', async () => {
    const { milestoneCapacity, canWitness, GATED_MILESTONES, chartWindow } = await import('./catalog')
    expect(milestoneCapacity('first_rotation')).toBe('commissioning')
    expect(milestoneCapacity('first_hydrocarbon')).toBe('operations')
    expect(canWitness(fallbackCapacities('client'), 'first_hydrocarbon', 'u2', 'u1')).toBe(true)
    expect(canWitness(fallbackCapacities('client'), 'first_rotation', 'u2', 'u1')).toBe(false)
    expect(canWitness(fallbackCapacities('owner'), 'first_rotation', 'u1', 'u1')).toBe(false)
    expect(GATED_MILESTONES).toEqual(['first_startup', 'first_hydrocarbon'])
    expect(chartWindow('2026-10-16T10:00:00.000Z')).toEqual({ from: '2026-10-16T09:30:00.000Z', to: '2026-10-16T10:30:00.000Z' })
  })
})

describe('arranque — propiedad del sistema', () => {
  it('etapas, nivel vigente y firmas posibles', async () => {
    const { nextStage, previousStages, currentLevel, signableCapacities } = await import('./catalog')
    expect(nextStage('commissioning')).toBe('shadowing')
    expect(nextStage('operations')).toBeNull()
    expect(previousStages('joint_operation')).toEqual(['commissioning', 'shadowing'])
    const recs = [
      { level: 2, assessed_at: '2026-01-01', created_at: 'a', expires_at: null },
      { level: 3, assessed_at: '2026-06-01', created_at: 'b', expires_at: '2026-09-01' },
    ]
    expect(currentLevel(recs, '2026-08-01')).toBe(3)
    expect(currentLevel(recs, '2026-10-01')).toBe(0)
    expect(currentLevel([], '2026-10-01')).toBe(0)
    expect(signableCapacities(fallbackCapacities('leader'), 'u1', { commissioning_signed_by: null, operations_signed_by: null })).toEqual(['commissioning', 'operations'])
    expect(signableCapacities(fallbackCapacities('client'), 'u1', { commissioning_signed_by: 'u2', operations_signed_by: null })).toEqual(['operations'])
    expect(signableCapacities(fallbackCapacities('leader'), 'u2', { commissioning_signed_by: 'u2', operations_signed_by: null })).toEqual([])
  })
})
