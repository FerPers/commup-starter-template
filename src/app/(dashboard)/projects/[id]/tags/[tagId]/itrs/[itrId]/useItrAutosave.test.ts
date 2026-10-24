import { beforeEach, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), transitions: [] as Promise<unknown>[] }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(), useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }),
  useTransition: () => [false, (fn: () => Promise<unknown>) => { harness.transitions.push(fn()) }],
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: harness.refresh }) }))
vi.mock('@/lib/offline-queue', () => ({ getAllQueued: vi.fn(async () => []), OUTBOX_CHANGED_EVENT: 'x' }))
vi.mock('@/lib/sync/owner', () => ({ currentUserId: vi.fn(async () => 'u') }))
vi.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => ({ saveWithQueue: harness.save }) }))
import { useItrAutosave } from './useItrAutosave'
import type { ItrData } from './types'
beforeEach(() => { vi.clearAllMocks(); harness.transitions.length = 0 })
it('persists the next field while a previous request is pending', async () => {
  let release!: (value: { queued: boolean }) => void
  harness.save.mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue({ queued: false })
  const hook = useItrAutosave({ id: 'itr', template_id: 'template', itr_responses: [] } as unknown as ItrData)
  hook.saveResponse('text', { valueText: 'test' })
  await Promise.resolve()
  hook.saveResponse('date', { valueText: '2026-09-09' })
  expect(harness.save).toHaveBeenCalledTimes(1)
  release({ queued: false })
  await Promise.all(harness.transitions)
  expect(harness.save.mock.calls).toEqual([['text', { valueText: 'test' }, null], ['date', { valueText: '2026-09-09' }, null]])
  // C-19: guardar ya no recarga la página entera.
  expect(harness.refresh).not.toHaveBeenCalled()
})
it('continues saving later fields after a request throws', async () => {
  harness.save.mockRejectedValueOnce(new Error('Network failure')).mockResolvedValue({ queued: false })
  const hook = useItrAutosave({ id: 'itr', template_id: 'template', itr_responses: [] } as unknown as ItrData)
  hook.saveResponse('first', { valueText: 'a' })
  hook.saveResponse('second', { valueText: 'b' })
  await Promise.allSettled(harness.transitions)
  expect(harness.save).toHaveBeenCalledTimes(2)
})
it('C-19: no vuelve a guardar lo que ya tiene la casilla', async () => {
  harness.save.mockResolvedValue({ queued: false })
  const hook = useItrAutosave({ id: 'itr', template_id: 'template', status: 'in_progress', itr_responses: [
    { id: 'r', item_id: 'yes', value_text: null, value_numeric: null, value_bool: true, value_option: null, remarks: null, is_passed: null, responded_at: 'v1' },
  ] } as unknown as ItrData)
  hook.saveResponse('yes', { valueBool: true, isPassed: null })
  hook.saveResponse('text', { valueText: 'a' })
  hook.saveResponse('text', { valueText: 'a' })
  await Promise.all(harness.transitions)
  expect(harness.save.mock.calls).toEqual([['text', { valueText: 'a' }, null]])
})
