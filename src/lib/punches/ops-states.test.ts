import { describe, expect, it } from 'vitest'
import { nextOpsStates } from './ops-states'

describe('nextOpsStates (S06)', () => {
  it('no se cierra sin verificar ni se verifica sin resolver', () => {
    expect(nextOpsStates('transferred_to_ops')).toEqual(['in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops'])
    expect(nextOpsStates('in_progress_ops')).not.toContain('closed_final')
    expect(nextOpsStates('resolved_ops')).toEqual(['verified_ops', 'in_progress_ops'])
    expect(nextOpsStates('verified_ops')).toEqual(['closed_final'])
  })
  it('estados finales o fuera de Operaciones: nada', () => {
    expect(nextOpsStates('closed_final')).toEqual([])
    expect(nextOpsStates('cancelled_ops')).toEqual([])
    expect(nextOpsStates(null)).toEqual([])
  })
})
