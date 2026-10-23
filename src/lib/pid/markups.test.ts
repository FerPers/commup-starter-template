import { describe, expect, it } from 'vitest'
import {
  defaultLimitSides, displayPoints, finishLine, fromStoredPoints, hitsMarkup, labelText, limitBar, limitNormal,
  markupSystemIds, nearestLine, toStoredPoints, validMarkupPoints,
} from './markups'
import type { PageSize, Pt } from './geometry'

// Hoja A1 apaisada en puntos PDF: la proporción importa (un tramo «horizontal» en unidad no es cuadrado).
const A1: PageSize = { w: 2384, h: 1684 }

describe('puntos guardados', () => {
  it('cantidad por tipo = pid_markup_points_ok', () => {
    const p = { x: 0.5, y: 0.5 }
    expect(validMarkupPoints('line', [p, p])).toBe(true)
    expect(validMarkupPoints('line', [p])).toBe(false)
    expect(validMarkupPoints('limit', [p, p])).toBe(true)
    expect(validMarkupPoints('limit', [p, p, p])).toBe(false)
    expect(validMarkupPoints('label', [p])).toBe(true)
    expect(validMarkupPoints('label', [p, p])).toBe(false)
    expect(validMarkupPoints('connector', [p])).toBe(true)
    expect(validMarkupPoints('connector', [p, p])).toBe(false)
    expect(validMarkupPoints('line', [p, { x: 1.01, y: 0 }])).toBe(false)
    expect(validMarkupPoints('line', [p, { x: Number.NaN, y: 0 }])).toBe(false)
    expect(validMarkupPoints('line', Array.from({ length: 501 }, () => p))).toBe(false)
  })

  it('ida y vuelta por jsonb con 6 decimales y acotado a 0..1', () => {
    const stored = toStoredPoints([{ x: 0.12345678, y: 1.2 }, { x: -0.1, y: 0.5 }])
    expect(stored).toEqual([[0.123457, 1], [0, 0.5]])
    expect(fromStoredPoints(stored)).toEqual([{ x: 0.123457, y: 1 }, { x: 0, y: 0.5 }])
    expect(fromStoredPoints(null)).toEqual([])
    expect(fromStoredPoints([[0.1, 0.2], 'x', [0.3]])).toEqual([{ x: 0.1, y: 0.2 }])
  })

  it('una marca dibujada a 0° cae en su lugar sobre la hoja girada 90°', () => {
    const m = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], page_rotation: 0 as const }
    const shown = displayPoints(m, 90)
    expect(shown[0].x).toBeCloseTo(1); expect(shown[0].y).toBeCloseTo(0)
    expect(shown[1].x).toBeCloseTo(1); expect(shown[1].y).toBeCloseTo(1)
    expect(displayPoints(m, 0)).toEqual(m.points)
  })
})

describe('terminar una línea', () => {
  it('el doble clic final no deja vértices repetidos y los colineales se van', () => {
    const pts: Pt[] = [{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.5004, y: 0.8001 }]
    expect(finishLine(pts, A1)).toEqual([{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }])
  })

  it('un solo vértice (o dos en el mismo lugar) no es una línea', () => {
    expect(finishLine([{ x: 0.2, y: 0.2 }], A1)).toBeNull()
    expect(finishLine([{ x: 0.2, y: 0.2 }, { x: 0.2001, y: 0.2 }], A1)).toBeNull()
  })
})

describe('límites', () => {
  const s1 = { id: 'l1', system_id: 'S1', points: [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }] }
  const s2 = { id: 'l2', system_id: 'S2', points: [{ x: 0.4, y: 0.5 }, { x: 0.8, y: 0.5 }] }
  const v = { id: 'l3', system_id: 'S3', points: [{ x: 0.7, y: 0.1 }, { x: 0.7, y: 0.4 }] }

  it('la línea más cercana dentro de la tolerancia, con el punto proyectado sobre ella', () => {
    const hit = nearestLine({ x: 0.25, y: 0.505 }, [s1, s2, v], A1, 20)
    expect(hit?.line.id).toBe('l1')
    expect(hit?.at.y).toBeCloseTo(0.5)
    expect(nearestLine({ x: 0.25, y: 0.7 }, [s1, s2], A1, 20)).toBeNull()
  })

  it('sobre un tramo horizontal la barra es vertical y se apoya en la línea', () => {
    const hit = nearestLine({ x: 0.4, y: 0.503 }, [s1], A1, 20)!
    const [a, b] = limitBar({ x: 0.4, y: 0.503 }, hit, A1)
    expect(a.x).toBeCloseTo(0.4); expect(b.x).toBeCloseTo(0.4)
    expect((a.y + b.y) / 2).toBeCloseTo(0.5)
    expect(Math.abs(b.y - a.y) * A1.h).toBeCloseTo(1684 * 0.04, 3)
    expect(limitNormal([a, b], A1)).toEqual({ x: 1, y: -0 })
  })

  it('sobre un tramo vertical la barra es horizontal; sin línea cerca, vertical', () => {
    const hit = nearestLine({ x: 0.701, y: 0.3 }, [v], A1, 20)!
    const [a, b] = limitBar({ x: 0.701, y: 0.3 }, hit, A1)
    expect(a.y).toBeCloseTo(0.3); expect(b.y).toBeCloseTo(0.3)
    expect(limitNormal([a, b], A1).y).toBeCloseTo(1)
    const [c, d] = limitBar({ x: 0.2, y: 0.2 }, null, A1)
    expect(c.x).toBeCloseTo(d.x)
  })

  it('cada sistema queda del lado donde sigue su recorrido', () => {
    const at = { x: 0.4, y: 0.5 }
    // tocando el tramo de S1 (que sigue hacia la izquierda) con S2 cerca: S1 | S2
    const hit1 = nearestLine(at, [s1], A1, 20)!
    const bar1 = limitBar(at, hit1, A1)
    expect(defaultLimitSides(bar1, hit1, [s1, s2], A1, null)).toEqual({ system_id: 'S1', other_system_id: 'S2' })
    // tocando el de S2 (que sigue hacia la derecha): S1 | S2 igual
    const hit2 = nearestLine(at, [s2], A1, 20)!
    const bar2 = limitBar(at, hit2, A1)
    expect(defaultLimitSides(bar2, hit2, [s1, s2], A1, null)).toEqual({ system_id: 'S1', other_system_id: 'S2' })
    // sin la otra línea: límite de batería
    expect(defaultLimitSides(bar1, hit1, [s1], A1, null)).toEqual({ system_id: 'S1', other_system_id: null })
    // sin línea tocada: el sistema activo
    expect(defaultLimitSides(bar1, null, [s1], A1, 'S9')).toEqual({ system_id: 'S9', other_system_id: null })
  })
})

describe('selección y leyenda', () => {
  it('toca una línea por distancia y una etiqueta cerca de su ancla', () => {
    const line = [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }]
    expect(hitsMarkup({ x: 0.2, y: 0.505 }, line, A1, 20)).toBe(true)
    expect(hitsMarkup({ x: 0.2, y: 0.6 }, line, A1, 20)).toBe(false)
    expect(hitsMarkup({ x: 0.301, y: 0.3 }, [{ x: 0.3, y: 0.3 }], A1, 20)).toBe(true)
  })

  it('sistemas de las marcas sin repetir, incluido el otro lado del límite', () => {
    expect(markupSystemIds([
      { system_id: 'A', other_system_id: null }, { system_id: 'A', other_system_id: 'B' }, { system_id: 'C', other_system_id: null },
    ]).sort()).toEqual(['A', 'B', 'C'])
  })

  it('la etiqueta muestra el texto escrito o el código del sistema', () => {
    const codeOf = (id: string) => ({ S1: 'A100-S01' } as Record<string, string>)[id]
    expect(labelText({ label: null, system_id: 'S1' }, codeOf)).toBe('A100-S01')
    expect(labelText({ label: '  ', system_id: 'S1' }, codeOf)).toBe('A100-S01')
    expect(labelText({ label: 'LB', system_id: 'S1' }, codeOf)).toBe('LB')
    expect(labelText({ label: null, system_id: 'X' }, codeOf)).toBe('?')
  })
})
