import { describe, expect, it } from 'vitest'
import { FOCUS_MARGIN, moveVertex, scrollToBox, systemFocus, zoomToBox } from './view'

const A4 = { w: 842, h: 595 }

describe('P3: abrir el plano en un sistema', () => {
  it('elige la hoja con más presencia (marcas pesan más) y su caja', () => {
    const f = systemFocus('s1', [
      { page: 1, systemIds: ['s1'], points: [{ x: 0.1, y: 0.1 }] },
      { page: 1, systemIds: ['s1'], points: [{ x: 0.2, y: 0.2 }] },
      { page: 2, systemIds: ['s1', 's2'], points: [{ x: 0.5, y: 0.4 }, { x: 0.7, y: 0.4 }] },
      { page: 2, systemIds: ['s1'], points: [{ x: 0.6, y: 0.5 }] },
      { page: 3, systemIds: ['s2'], points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] },
    ])
    expect(f).toEqual({ page: 2, box: { minX: 0.5, minY: 0.4, maxX: 0.7, maxY: 0.5 } })
  })

  it('null si el sistema no está en el plano', () => {
    expect(systemFocus('s9', [{ page: 1, systemIds: ['s1'], points: [{ x: 0.1, y: 0.1 }] }])).toBeNull()
  })

  it('zoom: encuadra la caja, nunca menos de 1 ni más del máximo', () => {
    const view = { w: 1000, h: 700 }
    // Caja de 0,2 × 0,1 → ancho con margen 0,32 → 1000 / (968 × 0,32) ≈ 3,2 → tope 3.
    expect(zoomToBox({ minX: 0.4, minY: 0.4, maxX: 0.6, maxY: 0.5 }, A4, view, 968, 3)).toBe(3)
    // Hoja entera → 1.
    expect(zoomToBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, A4, view, 968, 3)).toBe(1)
    // Caja mediana: limita la altura.
    const s = zoomToBox({ minX: 0.1, minY: 0.1, maxX: 0.6, maxY: 0.7 }, A4, view, 968, 3)
    expect(s).toBeCloseTo(view.h / (968 * (A4.h / A4.w) * (0.6 + 2 * FOCUS_MARGIN)), 2)
  })

  it('scroll centra la caja', () => {
    expect(scrollToBox({ minX: 0.4, minY: 0.4, maxX: 0.6, maxY: 0.6 }, { w: 3000, h: 2000 }, { w: 1000, h: 800 }))
      .toEqual({ left: 1516 - 500, top: 1016 - 400 })
    expect(scrollToBox({ minX: 0, minY: 0, maxX: 0.1, maxY: 0.1 }, { w: 1000, h: 700 }, { w: 1000, h: 800 })).toEqual({ left: 0, top: 0 })
  })
})

describe('P3: mover un vértice', () => {
  const line = [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }]

  it('se ajusta a 90° respecto del vecino', () => {
    const out = moveVertex(line, 2, { x: 0.51, y: 0.9 }, A4, true)
    expect(out[2]).toEqual({ x: 0.5, y: 0.9 })
    expect(out[0]).toBe(line[0])
  })

  it('sin ajuste (límite, etiqueta) y acotado a la hoja', () => {
    expect(moveVertex([{ x: 0.2, y: 0.2 }], 0, { x: 1.4, y: -0.2 }, A4, false)).toEqual([{ x: 1, y: 0 }])
    expect(moveVertex(line, 7, { x: 0, y: 0 }, A4, true)).toBe(line)
  })
})
