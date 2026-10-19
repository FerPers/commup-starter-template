import { describe, expect, it } from 'vitest'
import {
  badgeTotal, canSignCertificates, daysOverdue, dueState, parseCounts, seesPreservation,
  isMyTurnToSign, sortPunches, splitAssignments, EMPTY_COUNTS, type AssignmentRow,
} from './queues'
import { homeForRole } from '@/lib/constants/navigation'

const TODAY = '2026-09-04'
const P = new Set(['p1'])

function asg(over: Partial<AssignmentRow['itrs'] & { role: AssignmentRow['role']; id: string }>): AssignmentRow {
  const { role = 'executor', id, ...itr } = over
  return {
    role,
    itrs: {
      id: id!, itr_number: `ITR-${id}`, status: 'not_started', progress_pct: 0, scheduled_date: null, completed_date: null,
      project_id: 'p1', tags: null, projects: null, project_phases: null, itr_signatures: [], ...itr,
    },
  }
}

describe('homeForRole', () => {
  it('inspector y leader entran a Mi trabajo; el resto al Dashboard', () => {
    expect(homeForRole('inspector')).toBe('/my-work')
    expect(homeForRole('leader')).toBe('/my-work')
    for (const r of ['owner', 'admin', 'architect', 'client', null, undefined]) expect(homeForRole(r)).toBe('/dashboard')
  })
})

describe('parseCounts / badgeTotal', () => {
  it('tolera nulos, strings y negativos', () => {
    expect(parseCounts(null)).toEqual(EMPTY_COUNTS)
    expect(parseCounts({ itrs_execute: '3', punches: -2, signatures: 1.9 })).toMatchObject({ itrs_execute: 3, punches: 0, signatures: 1 })
  })

  it('el badge suma lo personal; las firmas solo para roles firmantes; preservación nunca', () => {
    const c = { ...EMPTY_COUNTS, itrs_execute: 2, itrs_review: 1, punches: 3, plan_items: 1, signatures: 4, preservation_overdue: 9 }
    expect(badgeTotal(c, 'inspector')).toBe(7)
    expect(badgeTotal(c, 'leader')).toBe(7)
    expect(badgeTotal(c, 'architect')).toBe(11)
    expect(badgeTotal(c, 'owner')).toBe(11)
  })

  it('fase 4: la revisión de categoría suma al badge del supervisor; la verificación en campo no', () => {
    const c = { ...EMPTY_COUNTS, punches_verify: 5, punches_review: 2 }
    expect(badgeTotal(c, 'leader')).toBe(2)
    expect(badgeTotal(c, 'inspector')).toBe(0)
    expect(parseCounts({ punches_verify: '5', punches_review: 2 })).toMatchObject({ punches_verify: 5, punches_review: 2 })
  })

  it('fase 5: mis acciones y restricciones suman; las acciones por verificar no', () => {
    const c = { ...EMPTY_COUNTS, actions_mine: 2, constraints_mine: 1, actions_verify: 4 }
    expect(badgeTotal(c, 'inspector')).toBe(3)
    expect(parseCounts({ actions_mine: '2', actions_verify: 4, constraints_mine: 1 })).toMatchObject({ actions_mine: 2, actions_verify: 4, constraints_mine: 1 })
  })

  it('fase 5 (relevo): los relevos por recibir suman al badge salvo para client', () => {
    const c = { ...EMPTY_COUNTS, handovers_to_receive: 2 }
    expect(badgeTotal(c, 'inspector')).toBe(2)
    expect(badgeTotal(c, 'client')).toBe(0)
  })

  it('fase 6: los hold points por liberar suman; las filas de line-up por verificar no', () => {
    const c = { ...EMPTY_COUNTS, holds_to_release: 2, lineup_to_verify: 5, milestones_to_witness: 1 }
    expect(badgeTotal(c, 'leader')).toBe(3)
  })

  it('fase 6 (sesión 3): los traspasos por firmar suman al badge', () => {
    expect(badgeTotal({ ...EMPTY_COUNTS, transfers_to_sign: 2 }, 'client')).toBe(2)
    expect(parseCounts({ transfers_to_sign: '3' }).transfers_to_sign).toBe(3)
    expect(badgeTotal({ ...EMPTY_COUNTS, performance_to_decide: 1, performance_to_sign: 2 }, 'leader')).toBe(3)
    expect(parseCounts({ performance_to_sign: '4' }).performance_to_sign).toBe(4)
  })

  it('roles: firmantes y supervisión de preservación', () => {
    expect(['owner', 'admin', 'architect', 'leader', 'inspector', 'client'].map(r => canSignCertificates(r as never))).toEqual([true, true, true, false, false, false])
    expect(['owner', 'admin', 'architect', 'leader', 'inspector', 'client'].map(r => seesPreservation(r as never))).toEqual([true, true, true, true, false, false])
  })
})

describe('dueState / daysOverdue', () => {
  it('clasifica vencido, hoy, futuro y sin fecha', () => {
    expect(dueState('2026-09-01', TODAY)).toBe('overdue')
    expect(dueState('2026-09-04T10:00:00Z', TODAY)).toBe('today')
    expect(dueState('2026-09-10', TODAY)).toBe('future')
    expect(dueState(null, TODAY)).toBeNull()
  })
  it('cuenta días de atraso', () => {
    expect(daysOverdue('2026-08-30', TODAY)).toBe(5)
    expect(daysOverdue('2026-09-04', TODAY)).toBe(0)
    expect(daysOverdue('2026-09-09', TODAY)).toBe(0)
  })
})

describe('splitAssignments', () => {
  it('ejecutor: hasta que firma (incluye completado sin su firma y rechazado), por fecha programada y deduplicado', () => {
    const rows = [
      asg({ id: 'a', scheduled_date: '2026-09-10' }),
      asg({ id: 'b', scheduled_date: '2026-09-02', status: 'in_progress' }),
      asg({ id: 'c', status: 'approved' }),
      asg({ id: 'd' }),
      asg({ id: 'b', scheduled_date: '2026-09-02', status: 'in_progress' }),
      asg({ id: 'e', scheduled_date: '2026-09-05', status: 'completed' }),
      asg({ id: 'f', scheduled_date: '2026-09-06', status: 'rejected' }),
      asg({ id: 'g', status: 'completed', itr_signatures: [{ role: 'executor' }] }),
    ]
    const q = splitAssignments(rows, P)
    expect(q.execute.map(r => r.itrs!.id)).toEqual(['b', 'e', 'f', 'a', 'd'])
    expect(q.review).toEqual([])
  })

  it('supervisor: solo cuando firmó el ejecutor; cliente: cuando firmaron ejecutor y supervisor', () => {
    const exec = [{ role: 'executor' }]
    const rows = [
      asg({ id: 's1', role: 'supervisor', status: 'completed', completed_date: '2026-09-03', itr_signatures: exec }),
      asg({ id: 's2', role: 'supervisor', status: 'completed', completed_date: '2026-09-01', itr_signatures: exec }),
      asg({ id: 's3', role: 'supervisor', status: 'completed', itr_signatures: [...exec, { role: 'supervisor' }] }),
      asg({ id: 's4', role: 'supervisor', status: 'completed' }), // sin firma del ejecutor: aún no le toca
      asg({ id: 's5', role: 'supervisor', status: 'in_progress' }),
      asg({ id: 'c1', role: 'client', status: 'completed', itr_signatures: exec }), // falta el supervisor
      asg({ id: 'c2', role: 'client', status: 'completed', completed_date: '2026-09-02', itr_signatures: [...exec, { role: 'supervisor' }] }),
    ]
    const q = splitAssignments(rows, P)
    expect(q.review.map(r => r.itrs!.id)).toEqual(['s2', 'c2', 's1'])
    expect(q.execute).toEqual([])
  })

  it('isMyTurnToSign sigue el orden de sign_itr_atomic', () => {
    expect(isMyTurnToSign('executor', 'rejected', [])).toBe(true)
    expect(isMyTurnToSign('executor', 'approved', [])).toBe(false)
    expect(isMyTurnToSign('supervisor', 'completed', [])).toBe(false)
    expect(isMyTurnToSign('supervisor', 'completed', ['executor'])).toBe(true)
    expect(isMyTurnToSign('client', 'completed', ['executor'])).toBe(false)
    expect(isMyTurnToSign('client', 'completed', ['executor', 'supervisor'])).toBe(true)
  })

  it('ignora ITRs de proyectos fuera de la org activa y filas sin ITR', () => {
    const rows = [asg({ id: 'x', project_id: 'other' }), { role: 'executor' as const, itrs: null }]
    expect(splitAssignments(rows, P)).toEqual({ execute: [], review: [] })
  })
})

describe('sortPunches', () => {
  it('Cat A primero, luego fecha objetivo, sin fecha al final', () => {
    const rows = [
      { category: 'C' as const, target_date: '2026-09-01', punch_number: 'P-3' },
      { category: 'A' as const, target_date: null, punch_number: 'P-2' },
      { category: 'A' as const, target_date: '2026-09-05', punch_number: 'P-1' },
      { category: 'B' as const, target_date: '2026-08-01', punch_number: 'P-4' },
    ]
    expect(sortPunches(rows).map(p => p.punch_number)).toEqual(['P-1', 'P-2', 'P-4', 'P-3'])
  })
})
