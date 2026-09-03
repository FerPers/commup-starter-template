import { describe, expect, it } from 'vitest'
import { isOpenPunch, sumCert, sumItr, sumPunch, type ItrPhaseCount, type PunchCount, type CertCount } from './kpi-query'

const P = 'p1'
const itrs: ItrPhaseCount[] = [
  { project_id: P, phase_id: 'A', status: 'approved', n: 10 },
  { project_id: P, phase_id: 'A', status: 'in_progress', n: 5 },
  { project_id: P, phase_id: 'B', status: 'approved', n: 2 },
  { project_id: 'p2', phase_id: 'A', status: 'approved', n: 100 },
]
const punches: PunchCount[] = [
  { project_id: P, category: 'A', status: 'open', n: 3 },
  { project_id: P, category: 'A', status: 'closed', n: 7 },
  { project_id: P, category: 'B', status: 'in_progress', n: 4 },
  { project_id: P, category: 'C', status: 'cancelled', n: 1 },
]
const certs: CertCount[] = [
  { project_id: P, status: 'issued', n: 3 },
  { project_id: P, status: 'pending', n: 2 },
]

describe('kpi aggregates', () => {
  it('sumItr suma por predicado (fase, estado, proyecto)', () => {
    expect(sumItr(itrs)).toBe(117)
    expect(sumItr(itrs, i => i.project_id === P)).toBe(17)
    expect(sumItr(itrs, i => i.phase_id === 'A' && i.status === 'approved')).toBe(110)
  })

  it('isOpenPunch: open/in_progress abiertos; closed/cancelled no', () => {
    expect(punches.filter(isOpenPunch).map(p => p.status)).toEqual(['open', 'in_progress'])
  })

  it('sumPunch: Cat A abiertos vs cerrados', () => {
    expect(sumPunch(punches, p => p.category === 'A' && isOpenPunch(p))).toBe(3)
    expect(sumPunch(punches, p => p.category === 'A' && !isOpenPunch(p))).toBe(7)
    expect(sumPunch(punches)).toBe(15)
  })

  it('sumCert: emitidos', () => {
    expect(sumCert(certs, c => c.status === 'issued')).toBe(3)
    expect(sumCert(certs)).toBe(5)
  })
})
