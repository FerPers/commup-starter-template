import { describe, expect, it } from 'vitest'
import { reshapeContinuity } from './continuity-editor'

describe('continuity editor', () => {
  it('retains measurements by conductor when the scope adds pairs without accepting new rows', () => {
    const original = reshapeContinuity(null, { grouping: 'pairs', count: 1, shields: [] }, false)
    original.rows[0] = { ...original.rows[0], from: 'TB1:1', to: 'TB2:1', result: 'pass' }
    const expanded = reshapeContinuity(original, { grouping: 'pairs', count: 2, shields: ['general'] }, false)
    expect(expanded.rows.map(row => row.id)).toEqual(['P1-A', 'P1-B', 'P2-A', 'P2-B', 'S:general'])
    expect(expanded.rows[0]).toEqual(original.rows[0])
    expect(expanded.rows[2].result).toBe('')
  })
  it('does not transfer a pair result to a differently identified conductor', () => {
    const original = reshapeContinuity(null, { grouping: 'pairs', count: 1, shields: [] }, false)
    original.rows[0].result = 'pass'
    expect(reshapeContinuity(original, { grouping: 'conductors', count: 1, shields: [] }, false).rows[0].result).toBe('')
  })
  it('takes the reading requirement from the template, not from the previous capture', () => {
    const original = { ...reshapeContinuity(null, { grouping: 'conductors', count: 1, shields: [] }, false), measurementRequired: true }
    expect(reshapeContinuity(original, { grouping: 'conductors', count: 1, shields: [] }, false).measurementRequired).toBe(false)
  })
})
