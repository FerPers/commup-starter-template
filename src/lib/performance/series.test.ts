import { describe, expect, it } from 'vitest'
import { minMaxDownsample } from './series'

describe('minMaxDownsample (S12, E-33)', () => {
  it('no toca series cortas', () => {
    const pts = [{ t: 1, v: 1 }, { t: 2, v: 2 }]
    expect(minMaxDownsample(pts, 10)).toBe(pts)
  })

  it('conserva un pico de 2 puntos en 6 h a 1 min (360 → ≤ 60)', () => {
    const pts = Array.from({ length: 360 }, (_, i) => ({ t: i, v: i === 200 || i === 201 ? 0 : 100 }))
    const out = minMaxDownsample(pts, 60)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.some(p => p.v === 0)).toBe(true)
    expect(out.every((p, i) => i === 0 || p.t >= out[i - 1].t)).toBe(true)
  })
})
