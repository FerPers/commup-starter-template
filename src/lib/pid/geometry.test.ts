import { describe, expect, it } from 'vitest'
import {
  bounds, clampPct, distance, distanceToPolyline, distanceToSegment, normalizeRotation, pointerToPct, pointerToUnit,
  polylineLength, reprojectPoint, rotatePoint, rotatedSize, simplify, snapOrthogonal, unrotatePoint,
  type Pt, type Rotation,
} from './geometry'

const ROTATIONS: Rotation[] = [0, 90, 180, 270]
const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 10)
  expect(a.y).toBeCloseTo(b.y, 10)
}

describe('pines en porcentaje', () => {
  it('el borde derecho e inferior queda en 100 (antes desbordaba numeric(6,4))', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 }
    expect(pointerToPct(210, 120, rect)).toEqual({ x: 100, y: 100 })
    expect(pointerToPct(260, 140, rect)).toEqual({ x: 100, y: 100 })
    expect(pointerToPct(0, 0, rect)).toEqual({ x: 0, y: 0 })
    expect(pointerToPct(110, 70, rect)).toEqual({ x: 50, y: 50 })
  })

  it('redondea a 4 decimales y descarta valores no finitos', () => {
    expect(clampPct(33.333333)).toBe(33.3333)
    expect(clampPct(100.00001)).toBe(100)
    expect(clampPct(-0.1)).toBe(0)
    expect(clampPct(Number.NaN)).toBe(0)
  })

  it('caja vacía (página aún sin pintar) no divide entre cero', () => {
    expect(pointerToPct(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
    expect(pointerToUnit(150, 50, { left: 100, top: 0, width: 100, height: 100 })).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('rotación de página', () => {
  it('90° horario lleva la esquina superior izquierda a la superior derecha', () => {
    close(rotatePoint({ x: 0, y: 0 }, 90), { x: 1, y: 0 })
    close(rotatePoint({ x: 1, y: 0 }, 90), { x: 1, y: 1 })
    close(rotatePoint({ x: 0.2, y: 0.1 }, 180), { x: 0.8, y: 0.9 })
    close(rotatePoint({ x: 0, y: 0 }, 270), { x: 0, y: 1 })
  })

  it('rotar y deshacer devuelve el mismo punto en las cuatro rotaciones', () => {
    const p = { x: 0.13, y: 0.71 }
    for (const r of ROTATIONS) close(unrotatePoint(rotatePoint(p, r), r), p)
  })

  it('cuatro giros de 90° vuelven al origen', () => {
    let p: Pt = { x: 0.3, y: 0.6 }
    for (let i = 0; i < 4; i++) p = rotatePoint(p, 90)
    close(p, { x: 0.3, y: 0.6 })
  })

  it('reproyecta entre rotaciones (dibujado a 0°, revisión nueva a 90°)', () => {
    const p = { x: 0.25, y: 0.4 }
    close(reprojectPoint(p, 0, 90), rotatePoint(p, 90))
    close(reprojectPoint(reprojectPoint(p, 90, 270), 270, 90), p)
    close(reprojectPoint(p, 180, 180), p)
  })

  it('normaliza grados y tamaño girado', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(89)).toBe(90)
    expect(rotatedSize({ w: 841, h: 594 }, 90)).toEqual({ w: 594, h: 841 })
    expect(rotatedSize({ w: 841, h: 594 }, 180)).toEqual({ w: 841, h: 594 })
  })
})

describe('distancias', () => {
  const size = { w: 200, h: 100 }

  it('al segmento: perpendicular, extremos y segmento degenerado', () => {
    expect(distanceToSegment({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 1, y: 0 }, size)).toBeCloseTo(50)
    expect(distanceToSegment({ x: 1.5, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, size)).toBeCloseTo(100)
    expect(distanceToSegment({ x: 0.5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, size)).toBeCloseTo(100)
  })

  it('a la polilínea = el tramo más cercano; vacía = Infinity', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    expect(distanceToPolyline({ x: 0.9, y: 0.5 }, line, size)).toBeCloseTo(20)
    expect(distanceToPolyline({ x: 0, y: 0 }, [], size)).toBe(Infinity)
    expect(distanceToPolyline({ x: 0, y: 0.5 }, [{ x: 0, y: 0 }], size)).toBeCloseTo(50)
  })

  it('largo en el espacio de la página respeta la proporción', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], size)).toBeCloseTo(300)
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(Math.SQRT2)
  })
})

describe('ajuste ortogonal', () => {
  it('endereza tramos casi horizontales o verticales', () => {
    expect(snapOrthogonal({ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.52 })).toEqual({ x: 0.6, y: 0.5 })
    expect(snapOrthogonal({ x: 0.5, y: 0.1 }, { x: 0.51, y: 0.7 })).toEqual({ x: 0.5, y: 0.7 })
    expect(snapOrthogonal({ x: 0.6, y: 0.5 }, { x: 0.1, y: 0.52 })).toEqual({ x: 0.1, y: 0.5 })
  })

  it('deja los diagonales y el mismo punto', () => {
    expect(snapOrthogonal({ x: 0, y: 0 }, { x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 })
    expect(snapOrthogonal({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 })).toEqual({ x: 0.2, y: 0.2 })
  })

  it('mide el ángulo en la página, no en la unidad', () => {
    // En unidad parece 45°, pero en una hoja 10:1 el tramo es casi horizontal (≈ 5,7°).
    expect(snapOrthogonal({ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { w: 1000, h: 100 })).toEqual({ x: 0.1, y: 0 })
  })
})

describe('simplificación', () => {
  it('quita vértices casi colineales y conserva esquinas y extremos', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 0.25, y: 0.001 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0 },
      { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 1.001, y: 0.75 }, { x: 1, y: 1 },
    ]
    expect(simplify(pts, 0.01)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])
  })

  it('con epsilon 0 solo quita duplicados consecutivos y no muta la entrada', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0.5, y: 0.2 }, { x: 1, y: 0 }]
    const copy = JSON.parse(JSON.stringify(pts))
    expect(simplify(pts, 0)).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0.2 }, { x: 1, y: 0 }])
    expect(pts).toEqual(copy)
  })

  it('caja de los puntos', () => {
    expect(bounds([])).toBeNull()
    expect(bounds([{ x: 0.2, y: 0.9 }, { x: 0.7, y: 0.1 }])).toEqual({ minX: 0.2, minY: 0.1, maxX: 0.7, maxY: 0.9 })
  })
})
