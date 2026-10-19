import { describe, expect, it } from 'vitest'
import { reflexiveRuleError } from './rules'

describe('reflexiveRuleError (I-10)', () => {
  it('rechaza «punch creado → crear punch»', () => {
    expect(reflexiveRuleError('punches.created', 'create_punch')).toMatch(/a sí misma/)
    expect(reflexiveRuleError(' punches.created ', 'create_punch')).not.toBeNull()
  })
  it('acepta el resto', () => {
    expect(reflexiveRuleError('itrs.updated', 'create_punch')).toBeNull()
    expect(reflexiveRuleError('punches.created', 'notify_user')).toBeNull()
  })
})
