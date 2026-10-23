import { describe, expect, it } from 'vitest'
import { isReflexiveRule } from './rules'

describe('isReflexiveRule (I-10)', () => {
  it('rechaza «punch creado → crear punch»', () => {
    expect(isReflexiveRule('punches.created', 'create_punch')).toBe(true)
    expect(isReflexiveRule(' punches.created ', 'create_punch')).toBe(true)
  })
  it('acepta el resto', () => {
    expect(isReflexiveRule('itrs.updated', 'create_punch')).toBe(false)
    expect(isReflexiveRule('punches.created', 'notify_user')).toBe(false)
  })
})
