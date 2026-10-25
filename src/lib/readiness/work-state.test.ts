import { describe, expect, it } from 'vitest'
import { gateWorkState } from './work-state'
import { WORK_STATE_CASES } from './work-state.cases'

describe('«no listo» según su causa (A08 · E4)', () => {
  for (const c of WORK_STATE_CASES) {
    it(c.name, () => expect(gateWorkState(c.status, c.criteria)).toBe(c.expected))
  }
})
