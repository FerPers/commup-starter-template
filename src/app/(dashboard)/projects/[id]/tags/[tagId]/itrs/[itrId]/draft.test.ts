import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_DELAY_MS, draftController } from './draft'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('borrador de un campo del ITR (C-19)', () => {
  it('guarda una sola vez cuando se deja de escribir', () => {
    const commit = vi.fn()
    const ctl = draftController('', commit)
    ctl.change('P'); ctl.change('PT'); ctl.change('PT-1')
    vi.advanceTimersByTime(DRAFT_DELAY_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit.mock.calls).toEqual([['PT-1']])
    expect(ctl.dirty).toBe(false)
  })

  it('salir del campo (o que la página se oculte) guarda ya y cancela el guardado programado', () => {
    const commit = vi.fn()
    const ctl = draftController('', commit)
    ctl.change('12.5')
    expect(ctl.flush()).toBe(true)
    vi.advanceTimersByTime(DRAFT_DELAY_MS * 2)
    expect(commit.mock.calls).toEqual([['12.5']])
  })

  it('no guarda si el valor no cambió (salir sin tocar, volver a lo guardado)', () => {
    const commit = vi.fn()
    const ctl = draftController('ok', commit)
    expect(ctl.flush()).toBe(false)
    ctl.change('okk'); ctl.change('ok')
    vi.advanceTimersByTime(DRAFT_DELAY_MS)
    expect(commit).not.toHaveBeenCalled()
  })

  it('sigue al servidor si no hay nada escrito sin guardar', () => {
    const ctl = draftController('mía', vi.fn())
    ctl.serverValue('del servidor')
    expect(ctl.value).toBe('del servidor')
    expect(ctl.flush()).toBe(false)
  })

  it('no pisa lo que se está escribiendo con un valor del servidor, y lo guarda después', () => {
    const commit = vi.fn()
    const ctl = draftController('', commit)
    ctl.change('escribiendo')
    ctl.serverValue('otro')
    expect(ctl.value).toBe('escribiendo')
    vi.advanceTimersByTime(DRAFT_DELAY_MS)
    expect(commit.mock.calls).toEqual([['escribiendo']])
  })

  it('guarda con la función vigente aunque haya cambiado después de programar', () => {
    const first = vi.fn()
    const second = vi.fn()
    const ctl = draftController('', first)
    ctl.change('x')
    ctl.setCommit(second)
    vi.advanceTimersByTime(DRAFT_DELAY_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second.mock.calls).toEqual([['x']])
  })
})
