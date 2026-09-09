import { describe, expect, it } from 'vitest'
import { evaluateItrCompletion, type CompletionItem, type CompletionResponse } from './completion'
const item = (id: string, patch: Partial<CompletionItem> = {}): CompletionItem => ({ id, item_type: 'text', is_required: true, requires_photo: false, requires_measurement: false, options: null, condition_item_id: null, condition_value: null, ...patch })
const response = (item_id: string, patch: Partial<CompletionResponse> = {}): CompletionResponse => ({ item_id, value_text: null, value_numeric: null, value_bool: null, value_option: null, ...patch })
describe('evaluateItrCompletion', () => {
  it('does not count empty rows or round incomplete records to 100', () => {
    const items = Array.from({ length: 200 }, (_, n) => item(String(n)))
    const responses = items.map((i, n) => response(i.id, { value_text: n < 199 ? 'ok' : '  ' }))
    expect(evaluateItrCompletion(items, responses)).toMatchObject({ isComplete: false, progressPct: 99, missingRequiredItemIds: ['199'] })
  })
  it('accepts numeric zero and explicit false, but not nonfinite numbers', () => {
    expect(evaluateItrCompletion([item('a', { item_type: 'measurement' }), item('b', { item_type: 'yes_no' })], [response('a', { value_numeric: 0 }), response('b', { value_bool: false })]).isComplete).toBe(true)
    expect(evaluateItrCompletion([item('a', { item_type: 'number' })], [response('a', { value_numeric: NaN })]).isComplete).toBe(false)
  })
  it('excludes hidden descendants even when their stale parent answer matches', () => {
    const items = [item('a', { item_type: 'yes_no' }), item('b', { condition_item_id: 'a', condition_value: 'true' }), item('c', { condition_item_id: 'b', condition_value: 'yes' })]
    expect(evaluateItrCompletion(items, [response('a', { value_bool: false }), response('b', { value_text: 'yes' })])).toMatchObject({ isComplete: true, applicableCount: 1, applicableItemIds: ['a'], progressPct: 100 })
  })
  it('fails closed on malformed conditions and cycles', () => {
    for (const items of [[item('a', { condition_item_id: 'missing', condition_value: 'yes' })], [item('a', { condition_item_id: 'b', condition_value: 'yes' }), item('b', { condition_item_id: 'a', condition_value: 'yes' })]]) {
      const result = evaluateItrCompletion(items, [])
      expect(result.isComplete).toBe(false)
      expect(result.invalidConditionItemIds.length).toBeGreaterThan(0)
    }
  })
  it('requires item-scoped photos and auxiliary measurements', () => {
    const items = [item('a', { requires_photo: true, requires_measurement: true })]
    const responses = [response('a', { value_text: 'ok', value_numeric: 0 })]
    expect(evaluateItrCompletion(items, responses, [{ item_id: null, file_url: 'photo', file_type: 'image/jpeg' }]).isComplete).toBe(false)
    expect(evaluateItrCompletion(items, responses, [{ item_id: 'a', file_url: 'photo', file_type: 'image/jpeg' }]).isComplete).toBe(true)
  })
  it('requires an item-scoped PDF when the item demands documentary evidence', () => {
    const items = [item('a', { requires_document: true })]
    const responses = [response('a', { value_text: 'ok' })]
    expect(evaluateItrCompletion(items, responses, [{ item_id: 'a', file_url: 'photo.jpg', file_type: 'image/jpeg' }]).isComplete).toBe(false)
    expect(evaluateItrCompletion(items, responses, [{ item_id: null, file_url: 'cert.pdf', file_type: 'application/pdf' }]).isComplete).toBe(false)
    expect(evaluateItrCompletion(items, responses, [{ item_id: 'a', file_url: 'cert.pdf', file_type: 'application/pdf' }]).isComplete).toBe(true)
  })
  it('checks option membership and calendar dates without interpreting acceptance', () => {
    const select = item('a', { item_type: 'select', options: ['Aceptado', 'Rechazado'] })
    expect(evaluateItrCompletion([select], [response('a', { value_option: 'Rechazado' })]).isComplete).toBe(true)
    expect(evaluateItrCompletion([select], [response('a', { value_option: 'inventado' })]).isComplete).toBe(false)
    expect(evaluateItrCompletion([item('a', { item_type: 'date' })], [response('a', { value_text: '2026-02-30' })]).isComplete).toBe(false)
    expect(evaluateItrCompletion([item('a', { item_type: 'date' })], [response('a', { value_text: '2024-02-29' })]).isComplete).toBe(true)
  })
  it('does not require optional blanks or pretend template signatures are implemented', () => {
    expect(evaluateItrCompletion([item('a'), item('b', { is_required: false })], [response('a', { value_text: 'ok' })])).toMatchObject({ isComplete: true, progressPct: 100 })
    expect(evaluateItrCompletion([item('a', { item_type: 'signature' })], [response('a', { value_text: 'name' })]).isComplete).toBe(false)
    expect(evaluateItrCompletion([], []).isComplete).toBe(false)
  })
  it('uses the condition parent type instead of unrelated stale columns', () => {
    const items = [item('a', { item_type: 'select', options: ['yes', 'no'] }), item('b', { condition_item_id: 'a', condition_value: 'yes' })]
    expect(evaluateItrCompletion(items, [response('a', { value_bool: false, value_option: 'yes' })]).missingRequiredItemIds).toEqual(['b'])
  })
  it('counts an uploaded photo without a synthetic response row and ignores unrelated evidence', () => {
    const items = [item('a', { item_type: 'photo' })]
    expect(evaluateItrCompletion(items, [], [{ item_id: 'a', file_url: 'image', file_type: 'image/png' }]).isComplete).toBe(true)
    expect(evaluateItrCompletion(items, [], [{ item_id: 'other', file_url: 'image', file_type: 'image/png' }]).isComplete).toBe(false)
  })
  it('requires the auxiliary numeric value even if primary text is filled', () => {
    expect(evaluateItrCompletion([item('a', { requires_measurement: true })], [response('a', { value_text: 'done' })]).isComplete).toBe(false)
  })

})

describe('structured selection acceptance', () => {
  it('requires justification for not applicable', () => {
    const choice = item('choice', { item_type: 'select', options: ['NA'], option_outcomes: { NA: 'not_applicable' } })
    expect(evaluateItrCompletion([choice], [response('choice', { value_option: 'NA' })]).isComplete).toBe(false)
    expect(evaluateItrCompletion([choice], [response('choice', { value_option: 'NA', remarks: 'Outside this scope' })]).isComplete).toBe(true)
  })
  it('separates captured rejection from completeness without text heuristics', () => {
    const choice = item('choice', { item_type: 'select', options: ['X', 'No'], option_outcomes: { X: 'fail' } })
    expect(evaluateItrCompletion([choice], [response('choice', { value_option: 'X' })])).toMatchObject({ isComplete: true, rejectedItemIds: ['choice'] })
    expect(evaluateItrCompletion([choice], [response('choice', { value_option: 'No' })])).toMatchObject({ isComplete: true, rejectedItemIds: [] })
  })
})

it('requires every continuity row and treats conductor failure as rejection', () => {
 const data = { version: 1, grouping: 'conductors', count: 2, shields: [], measurementRequired: false, rows: [{ id: 'C1', from: 'A1', to: 'B1', result: 'fail', remarks: '', reading: null, unit: '' }] }
 const items = [item('c', { item_type: 'continuity' })]
 const evaluate = () => evaluateItrCompletion(items, [response('c', { value_text: JSON.stringify(data) })])
 expect(evaluate()).toMatchObject({ isComplete: false, rejectedItemIds: ['c'] })
 data.rows.push({ ...data.rows[0], id: 'C2', result: 'pass' })
 expect(evaluate()).toMatchObject({ isComplete: true, rejectedItemIds: ['c'] })
})
