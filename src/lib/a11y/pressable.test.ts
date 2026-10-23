import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { pressable } from './pressable'

const key = (k: string, inner = false) => {
  const el = {}
  return { key: k, target: inner ? {} : el, currentTarget: el, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>
}

describe('pressable', () => {
  it('es un botón enfocable', () => {
    const p = pressable(() => {})
    expect(p.role).toBe('button')
    expect(p.tabIndex).toBe(0)
  })
  it('Enter y Espacio pulsan; otras teclas no', () => {
    const fn = vi.fn()
    const p = pressable(fn)
    const space = key(' ')
    p.onKeyDown(key('Enter')); p.onKeyDown(space); p.onKeyDown(key('a'))
    expect(fn).toHaveBeenCalledTimes(2)
    expect(space.preventDefault).toHaveBeenCalled()
  })
  it('no reacciona a teclas de un campo interno', () => {
    const fn = vi.fn()
    pressable(fn).onKeyDown(key('Enter', true))
    expect(fn).not.toHaveBeenCalled()
  })
})
