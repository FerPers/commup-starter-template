import { describe, expect, it } from 'vitest'
import { approveImpact, revokeImpact, type ImpactGate } from './impact'

const gates: ImpactGate[] = [
  { gate_id: 'mc', gate_code: 'MC', gate_order: 1, status: 'approved' },
  { gate_id: 'rfc', gate_code: 'RFC', gate_order: 2, status: 'approved_with_conditions' },
  { gate_id: 'rfsu', gate_code: 'RFSU', gate_order: 3, status: 'ready' },
]
const provides = [
  { system_code: 'P-200', required_gate_id: 'mc', blocked_gate_id: 'rfc' },
  { system_code: 'P-300', required_gate_id: 'rfc', blocked_gate_id: 'rfsu' },
  { system_code: 'P-400', required_gate_id: 'rfsu', blocked_gate_id: 'rfsu' },
]

describe('impacto aguas abajo (S23, D-25)', () => {
  it('revocar MC deja en regresión RFC y afecta a quien depende de MC o posteriores', () => {
    expect(revokeImpact(gates, 'mc', provides)).toEqual({ ownGates: ['RFC'], dependents: ['P-200 · RFC', 'P-300 · RFSU', 'P-400 · RFSU'] })
  })
  it('revocar el último gate solo afecta a sus dependientes', () => {
    expect(revokeImpact(gates, 'rfsu', provides)).toEqual({ ownGates: [], dependents: ['P-400 · RFSU'] })
  })
  it('aprobar habilita el gate siguiente y a los dependientes de ese gate', () => {
    expect(approveImpact(gates, 'rfc', provides)).toEqual({ ownGates: ['RFSU'], dependents: ['P-300 · RFSU'] })
    expect(approveImpact(gates, 'x', provides)).toEqual({ ownGates: [], dependents: [] })
  })
})
