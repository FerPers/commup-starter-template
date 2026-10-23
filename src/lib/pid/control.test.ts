import { describe, expect, it } from 'vitest'
import { connectorPairs, connectorText, isConnectorPair, pinConflicts, type ConnectorForControl } from './control'
import type { PageSize } from './geometry'

const A1: PageSize = { w: 2384, h: 1684 }
const size = () => A1
// Tolerancia = markupMetrics(A1).hit = 1684 × 0,012 ≈ 20 pt ≈ 0,0084 de ancho.

describe('pines cruzados', () => {
  const lineA = { page_num: 1, system_id: 'A', points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] }
  const lineB = { page_num: 1, system_id: 'B', points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }] }

  it('tag de A sobre la línea de B (y lejos de la suya) = cruzado', () => {
    const pins = [{ id: 'p1', page_num: 1, x_pct: 50, y_pct: 20, system_id: 'A' }]
    expect(pinConflicts(pins, [lineA, lineB], size)).toEqual([{ pin_id: 'p1', page_num: 1, system_id: 'A', other_system_id: 'B', other_system_ids: ['B'] }])
  })

  it('sobre su propia línea, o en el cruce con la suya, no avisa', () => {
    const pins = [
      { id: 'own', page_num: 1, x_pct: 30, y_pct: 50, system_id: 'A' },
      { id: 'cross', page_num: 1, x_pct: 50, y_pct: 50, system_id: 'A' },
    ]
    expect(pinConflicts(pins, [lineA, lineB], size)).toEqual([])
  })

  it('lejos de toda línea, sin sistema, en otra hoja o sin tamaño: no avisa', () => {
    const pins = [
      { id: 'far', page_num: 1, x_pct: 80, y_pct: 80, system_id: 'A' },
      { id: 'nosys', page_num: 1, x_pct: 50, y_pct: 20, system_id: null },
      { id: 'other', page_num: 2, x_pct: 50, y_pct: 20, system_id: 'A' },
    ]
    expect(pinConflicts(pins, [lineA, lineB], size)).toEqual([])
    expect(pinConflicts([{ id: 'p', page_num: 1, x_pct: 50, y_pct: 20, system_id: 'A' }], [lineB], () => null)).toEqual([])
  })

  it('la tolerancia se mide en la página: 1 % de alto en una A1 apaisada es ~17 pt (dentro)', () => {
    const pins = [{ id: 'p', page_num: 1, x_pct: 30, y_pct: 51, system_id: 'B' }]
    expect(pinConflicts(pins, [lineA], size)).toHaveLength(1)
    expect(pinConflicts([{ ...pins[0], y_pct: 52 }], [lineA], size)).toHaveLength(0)
  })
})

describe('conectores entre hojas', () => {
  const c = (id: string, doc: string, page: number, sys: string, to: string | null, toPage: number | null): ConnectorForControl =>
    ({ id, document_id: doc, page_num: page, system_id: sys, target_document_id: to, target_page: toPage })

  it('par = mismo sistema y cada uno apunta a la hoja y página del otro', () => {
    const a = c('a', 'D1', 1, 'S', 'D2', 1)
    const b = c('b', 'D2', 1, 'S', 'D1', 1)
    expect(isConnectorPair(a, b)).toBe(true)
    expect(isConnectorPair(a, { ...b, system_id: 'T' })).toBe(false)
    expect(isConnectorPair(a, { ...b, page_num: 2 })).toBe(false)
    expect(isConnectorPair(a, { ...b, target_page: 3 })).toBe(false)
  })

  it('página destino null = 1, y la misma hoja en otra página también hace par', () => {
    expect(isConnectorPair(c('a', 'D1', 1, 'S', 'D2', null), c('b', 'D2', 1, 'S', 'D1', 1))).toBe(true)
    expect(isConnectorPair(c('a', 'D1', 1, 'S', 'D1', 2), c('b', 'D1', 2, 'S', 'D1', 1))).toBe(true)
  })

  it('connectorPairs: con par, sin par y sin destino', () => {
    const list = [c('a', 'D1', 1, 'S', 'D2', 1), c('b', 'D2', 1, 'S', 'D1', 1), c('x', 'D1', 1, 'S', 'D3', 1), c('z', 'D1', 1, 'S', null, null)]
    const pairs = connectorPairs(list)
    expect(pairs.get('a')).toBe('b')
    expect(pairs.get('b')).toBe('a')
    expect(pairs.get('x')).toBeNull()
    expect(pairs.get('z')).toBeNull()
  })

  it('texto: número de la hoja y la página si no es la 1', () => {
    expect(connectorText({ number: 'PID-002' }, 1, 'h.')).toBe('PID-002')
    expect(connectorText({ number: 'PID-002' }, 3, 'h.')).toBe('PID-002 · h. 3')
    expect(connectorText(null, 1, 'h.')).toBe('?')
  })
})
