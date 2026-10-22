import { describe, expect, it } from 'vitest'
import { nextPendingItemId } from './next-pending'

describe('siguiente ítem pendiente (C-29)', () => {
  const tops: Record<string, number | null> = { a: -400, b: 60, c: 300, d: 900 }
  const topOf = (id: string) => tops[id] ?? null

  it('salta al primero que está por debajo de la franja superior', () => {
    expect(nextPendingItemId(['a', 'b', 'c', 'd'], topOf)).toBe('c')
  })

  it('sin pendientes por debajo vuelve al primero; sin pendientes, nada', () => {
    expect(nextPendingItemId(['a', 'b'], topOf)).toBe('a')
    expect(nextPendingItemId([], topOf)).toBeNull()
  })

  it('ignora ítems sin posición (no renderizados)', () => {
    expect(nextPendingItemId(['x', 'd'], topOf)).toBe('d')
  })
})
