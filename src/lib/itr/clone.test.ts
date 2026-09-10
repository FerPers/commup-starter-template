import { describe, expect, it } from 'vitest'
import { conditionRemaps, itemInsertRow, localState, templateContentHash, type CloneSectionSource } from './clone'

const item = (id: string, order: number, extra: Partial<CloneSectionSource['itr_template_items'][number]> = {}) => ({
  id, item_number: `${order + 1}.0`, description: `Item ${id}`, description_es: null, item_type: 'select', is_required: true,
  is_critical: false, requires_photo: false, requires_measurement: false, options: ['Conforme', 'No conforme'],
  option_outcomes: { Conforme: 'pass', 'No conforme': 'fail' }, unit: null, acceptance_min: null, acceptance_max: null,
  acceptance_text: null, order_index: order, ...extra,
})
const template = (): CloneSectionSource[] => [
  { id: 's1', title: 'Inspección', order_index: 0, itr_template_items: [item('a', 0), item('b', 1, { condition_item_id: 'a', condition_value: 'Conforme' })] },
  { id: 's0', title: 'Referencias', order_index: -1, itr_template_items: [item('r', 0, { item_type: 'text', options: null, option_outcomes: {} })] },
]

describe('templateContentHash', () => {
  it('ignores ids, organisation and row order; depends on content', () => {
    const a = template()
    const renamed: CloneSectionSource[] = template().map(s => ({ ...s, id: 'x' + s.id, itr_template_items: s.itr_template_items.map(it => ({ ...it, id: 'x' + it.id, condition_item_id: it.condition_item_id ? 'x' + it.condition_item_id : it.condition_item_id })) })).reverse()
    expect(templateContentHash(renamed)).toBe(templateContentHash(a))
    const changed = template(); changed[0].itr_template_items[0].requires_photo = true
    expect(templateContentHash(changed)).not.toBe(templateContentHash(a))
    const outcomes = template(); outcomes[0].itr_template_items[0].option_outcomes = { Conforme: 'pass' }
    expect(templateContentHash(outcomes)).not.toBe(templateContentHash(a))
  })
  it('treats option key order as irrelevant but option list order as content', () => {
    const a = template()
    const keys = template(); keys[0].itr_template_items[0].option_outcomes = { 'No conforme': 'fail', Conforme: 'pass' }
    expect(templateContentHash(keys)).toBe(templateContentHash(a))
    const list = template(); list[0].itr_template_items[0].options = ['No conforme', 'Conforme']
    expect(templateContentHash(list)).not.toBe(templateContentHash(a))
  })
  it('changes when a condition points elsewhere and drops dangling ones', () => {
    const a = template()
    const other = template(); other[0].itr_template_items[1].condition_item_id = 'r'
    expect(templateContentHash(other)).not.toBe(templateContentHash(a))
    const dangling = template(); dangling[0].itr_template_items[1].condition_item_id = 'missing'
    const none = template(); none[0].itr_template_items[1].condition_item_id = null; none[0].itr_template_items[1].condition_value = null
    expect(templateContentHash(dangling)).toBe(templateContentHash(none))
  })
})

describe('itemInsertRow / conditionRemaps', () => {
  it('copies every v2 field and leaves the condition for the second pass', () => {
    const row = itemInsertRow(item('a', 0, { requires_document: true, description_es_source: 'ai', condition_item_id: 'z', condition_value: 'x' }), 'sec', 'tpl')
    expect(row).toMatchObject({ section_id: 'sec', template_id: 'tpl', requires_document: true, description_es_source: 'ai', option_outcomes: { Conforme: 'pass', 'No conforme': 'fail' }, condition_item_id: null, condition_value: null })
    expect(itemInsertRow(item('a', 0, { requires_document: undefined, option_outcomes: undefined }), 's', 't')).toMatchObject({ requires_document: false, option_outcomes: {} })
  })
  it('remaps conditions with the id map and drops the ones pointing outside', () => {
    const sections = template()
    const map = new Map([['a', 'A'], ['b', 'B'], ['r', 'R']])
    expect(conditionRemaps(sections, map)).toEqual([{ id: 'B', condition_item_id: 'A', condition_value: 'Conforme' }])
    sections[0].itr_template_items[1].condition_item_id = 'ghost'
    expect(conditionRemaps(sections, map)).toEqual([])
  })
})

describe('localState', () => {
  it('classifies new / same / outdated', () => {
    expect(localState('h', null)).toBe('new')
    expect(localState('h', { hash: 'h' })).toBe('same')
    expect(localState('h', { hash: 'g' })).toBe('outdated')
  })
})
