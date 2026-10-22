import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fallbackCapacities } from '@/lib/constants/capacities'
import {
  canReleaseHold, checkRange, currentLevel, DEFAULT_HOLD_CAPACITY, DEFAULT_NON_DISPENSABLE, emptyStep, filterLineupItems, isBlockingGap, lineupItemState, lineupProgress, needsBackdateReason, needsLockOrSeal, nextRunStep, parseFieldNumber, PROCEDURE_SECTIONS, rangeLabel, runProgress, stopChoices, textOrNull, TRANSFER_CHECK_KEYS, transferNonDispensable,
} from './catalog'

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

describe('S25a: reglas de gobernanza de arranque', () => {
  it('las claves del checklist de traspaso son las del SQL (ownership_check_keys y ownership_checklist)', () => {
    const keysSql = readFileSync('supabase/functions-sql/ownership_check_keys.sql', 'utf8')
    const arr = keysSql.match(/ARRAY\[([^\]]*)\]/)
    expect([...arr![1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1])).toEqual([...TRANSFER_CHECK_KEYS])
    const checklistSql = readFileSync('supabase/functions-sql/ownership_checklist.sql', 'utf8')
    const used = [...new Set([...checklistSql.matchAll(/'key', '([a-z_0-9]+)'/g)].map(m => m[1]))].sort()
    expect(used).toEqual([...TRANSFER_CHECK_KEYS].sort())
  })

  it('los no dispensables por defecto son los del SQL', () => {
    const sql = readFileSync('supabase/functions-sql/org_transfer_non_dispensable.sql', 'utf8')
    const m = sql.match(/ELSE ARRAY\[([^\]]*)\]/)
    expect([...m![1].matchAll(/'([a-z_0-9]+)'/g)].map(x => x[1])).toEqual([...DEFAULT_NON_DISPENSABLE])
  })

  it('transferNonDispensable: por defecto, configurado y claves desconocidas', () => {
    expect(transferNonDispensable({})).toEqual(['no_open_cat_a', 'startup_gate'])
    expect(transferNonDispensable({ transfer_policy: { non_dispensable: [] } })).toEqual([])
    expect(transferNonDispensable({ transfer_policy: { non_dispensable: ['critical_spares', 'xx', 'no_open_cat_a'] } })).toEqual(['no_open_cat_a', 'critical_spares'])
    expect(isBlockingGap({ key: 'no_open_cat_a', ok: false, detail: {} }, ['no_open_cat_a'])).toBe(true)
    expect(isBlockingGap({ key: 'no_open_cat_a', ok: true, detail: {} }, ['no_open_cat_a'])).toBe(false)
  })

  it('fecha atrasada: más de 7 días pide motivo', () => {
    const now = new Date('2026-10-21T12:00:00Z')
    expect(needsBackdateReason('2026-10-15T12:00:00Z', now)).toBe(false)
    expect(needsBackdateReason('2026-10-14T11:59:00Z', now)).toBe(true)
    expect(needsBackdateReason('no-fecha', now)).toBe(false)
  })

  it('nivel vigente ignora registros anulados (= person_system_level)', () => {
    const recs = [
      { level: 2, assessed_at: '2026-10-01', created_at: '2026-10-01T10:00:00Z', expires_at: null, voided_at: null },
      { level: 4, assessed_at: '2026-10-10', created_at: '2026-10-10T10:00:00Z', expires_at: null, voided_at: '2026-10-11T00:00:00Z' },
    ]
    expect(currentLevel(recs, '2026-10-21')).toBe(2)
    expect(readFileSync('supabase/functions-sql/person_system_level.sql', 'utf8')).toContain('voided_at IS NULL')
  })

  it('hold point por defecto = SQL', () => {
    expect(DEFAULT_HOLD_CAPACITY).toBe('commissioning')
    expect(emptyStep().hold_capacity).toBe(DEFAULT_HOLD_CAPACITY)
  })
})

describe('S25b: UX de campo', () => {
  it('rango esperado igual que complete_run_step (coma decimal, solo números)', () => {
    expect(checkRange('15', 11, 12)).toBe('out')
    expect(checkRange('11,8', 11, 12)).toBe('in')
    expect(checkRange('abierta', 11, 12)).toBe('na')
    expect(checkRange('10', 11, null)).toBe('out')
    expect(checkRange('99', null, null)).toBe('na')
    expect(readFileSync('supabase/functions-sql/complete_run_step.sql', 'utf8')).toContain("'^-?[0-9]+([.,][0-9]+)?$'")
    expect(parseFieldNumber(' -3,5 ')).toBe(-3.5)
  })

  it('etiqueta de rango y criterios de parada', () => {
    expect(rangeLabel(11, 12, 'barg')).toBe('11–12 barg')
    expect(rangeLabel(null, 5, null)).toBe('≤ 5')
    expect(stopChoices('- Vibración > 7 mm/s\n\nFuga visible', [{ ord: 3, stopCriteria: 'Fuga visible' }, { ord: 4, stopCriteria: null }], n => `Paso ${n}`))
      .toEqual(['Vibración > 7 mm/s', 'Fuga visible', 'Paso 3: Fuga visible'])
  })

  it('LO/LC exigen candado o sello (= set_lineup_item)', () => {
    expect(needsLockOrSeal('locked_open')).toBe(true)
    expect(needsLockOrSeal('open')).toBe(false)
    expect(readFileSync('supabase/functions-sql/set_lineup_item.sql', 'utf8')).toContain("p_found IN ('locked_open', 'locked_closed')")
    expect(textOrNull('  ')).toBeNull()
    expect(textOrNull(' C-12 ')).toBe('C-12')
  })

  it('filtros de una hoja larga', () => {
    const base = { required_position: 'open' as const, verified_at: null, description: null, pid: null }
    const items = [
      { ...base, tag_number: 'XV-101', label: '', is_critical: true, found_position: null, set_at: null },
      { ...base, tag_number: 'HV-200', label: '', is_critical: false, found_position: 'closed' as const, set_at: 'x', pid: 'PID-002' },
      { ...base, tag_number: 'XV-102', label: '', is_critical: true, found_position: 'open' as const, set_at: 'x' },
    ]
    expect(filterLineupItems(items, 'pending', '').map(i => i.tag_number)).toEqual(['XV-101'])
    expect(filterLineupItems(items, 'misaligned', '').map(i => i.tag_number)).toEqual(['HV-200'])
    expect(filterLineupItems(items, 'critical', '').map(i => i.tag_number)).toEqual(['XV-101', 'XV-102'])
    expect(filterLineupItems(items, 'all', 'pid-002').map(i => i.tag_number)).toEqual(['HV-200'])
  })
})
