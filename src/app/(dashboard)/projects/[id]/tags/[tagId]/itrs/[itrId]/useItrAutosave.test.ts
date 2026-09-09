import { beforeEach, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), transitions: [] as Promise<unknown>[] }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(), useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }),
  useTransition: () => [false, (fn: () => Promise<unknown>) => { harness.transitions.push(fn()) }],
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: harness.refresh }) }))
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
  expect(harness.save.mock.calls).toEqual([['text', { valueText: 'test' }], ['date', { valueText: '2026-09-09' }]])
  expect(harness.refresh).toHaveBeenCalledTimes(1)
})
it('continues saving later fields after a request throws', async () => {
  harness.save.mockRejectedValueOnce(new Error('Network failure')).mockResolvedValue({ queued: false })
  const hook = useItrAutosave({ id: 'itr', template_id: 'template', itr_responses: [] } as unknown as ItrData)
  hook.saveResponse('first', { valueText: 'a' })
  hook.saveResponse('second', { valueText: 'b' })
  await Promise.allSettled(harness.transitions)
  expect(harness.save).toHaveBeenCalledTimes(2)
})
