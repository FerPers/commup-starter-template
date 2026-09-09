import { beforeEach, describe, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ context: {} as Record<string, unknown> }))
vi.mock('@/lib/auth/withAuth', () => ({
  withAuth: (_options: unknown, handler: unknown) => handler,
  withAuthOnly: (_options: unknown, handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => handler(harness.context, ...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { createItem, updateItem, type ItemPayload } from './itr-templates'
let current: Record<string, unknown> | null
let writes: unknown[]
beforeEach(() => {
  current = { item_type: 'select', options: ['Sí', 'No'], option_outcomes: { No: 'pass' } }
  writes = []
  harness.context = { supabase: { from: () => {
    let mutation = false
    const query = {
      select: () => query, eq: () => query,
      insert(value: unknown) { mutation = true; writes.push(value); return query },
      update(value: unknown) { mutation = true; writes.push(value); return query },
      single: async () => ({ data: mutation ? { id: 'new' } : current, error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ error: null }).then(resolve) },
    }
    return query
  } } }
})
const item: ItemPayload = { description: 'Resultado', item_type: 'select', is_required: true,
  is_critical: false, requires_photo: false, requires_measurement: false, order_index: 0,
  options: ['Sí', 'No'], option_outcomes: { No: 'pass' } }
describe('template selection outcomes server validation', () => {
  it('preserves an explicitly accepted No without interpreting the label', async () => {
    expect((await createItem('section', 'template', item)).id).toBe('new')
    expect(writes[0]).toMatchObject({ option_outcomes: { No: 'pass' } })
  })
  it('rejects an outcome for an option outside the item', async () => {
    expect((await createItem('section', 'template', { ...item, option_outcomes: { Unknown: 'fail' } })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('validates a partial update against the stored options', async () => {
    expect((await updateItem('item', { option_outcomes: { Unknown: 'fail' } })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('rejects deleting an option while leaving its stored outcome orphaned', async () => {
    expect((await updateItem('item', { options: ['Sí'] })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('allows removing the orphaned mapping with its option', async () => {
    expect(await updateItem('item', { options: ['Sí'], option_outcomes: {} })).toEqual({})
    expect(writes).toHaveLength(1)
  })
  it('does not apply selection acceptance to a non-select field', async () => {
    expect((await updateItem('item', { item_type: 'text' })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
  it('does not write an inaccessible item', async () => {
    current = null
    expect((await updateItem('item', { option_outcomes: {} })).error).toBeTruthy()
    expect(writes).toEqual([])
  })
})
