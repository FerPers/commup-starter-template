import { describe, expect, it } from 'vitest'
import {
  canReviewRedline, cloudPath, cloudPoints, countByStatus, displayMarks, fromStoredMarks, hitsRedline, redlineAnchor, toStoredMarks, validRedlineMarks,
  type RedlineMark,
} from './redlines'

const size = { w: 1000, h: 800 }

describe('red-line: marcas (= pid_redline_marks_ok)', () => {
  it('cuenta los puntos por tipo y exige texto solo en «text»', () => {
    expect(validRedlineMarks([{ k: 'cloud', p: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }])).toBe(true)
    expect(validRedlineMarks([{ k: 'cloud', p: [{ x: 0.1, y: 0.1 }] }])).toBe(false)
    expect(validRedlineMarks([{ k: 'pen', p: [{ x: 0.1, y: 0.1 }] }])).toBe(false)
    expect(validRedlineMarks([{ k: 'text', p: [{ x: 0.5, y: 0.5 }], t: 'XV-103' }])).toBe(true)
    expect(validRedlineMarks([{ k: 'text', p: [{ x: 0.5, y: 0.5 }], t: '  ' }])).toBe(false)
    expect(validRedlineMarks([{ k: 'point', p: [{ x: 0.5, y: 0.5 }], t: 'x' }])).toBe(false)
    expect(validRedlineMarks([{ k: 'point', p: [{ x: 1.2, y: 0.5 }] }])).toBe(false)
    expect(validRedlineMarks([])).toBe(false)
  })

  it('ida y vuelta por jsonb conserva tipo, puntos y texto; descarta lo que no es marca', () => {
    const marks: RedlineMark[] = [
      { k: 'cloud', p: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
      { k: 'text', p: [{ x: 0.5, y: 0.5 }], t: ' nota ' },
    ]
    const stored = toStoredMarks(marks)
    expect(stored[1].t).toBe('nota')
    expect(fromStoredMarks([...stored, { k: 'otro', p: [[0, 0]] }, 'x'])).toEqual([
      { k: 'cloud', p: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
      { k: 'text', p: [{ x: 0.5, y: 0.5 }], t: 'nota' },
    ])
  })

  it('se reproyectan a la rotación de la hoja abierta', () => {
    const shown = displayMarks({ marks: [{ k: 'point', p: [{ x: 0.25, y: 0.1 }] }], page_rotation: 0 }, 0)
    expect(shown[0].p[0]).toEqual({ x: 0.25, y: 0.1 })
  })
})

describe('red-line: dibujo y toque', () => {
  it('el número va en la esquina de arriba a la izquierda de la nube', () => {
    expect(redlineAnchor([{ k: 'pen', p: [{ x: 0.9, y: 0.9 }, { x: 0.8, y: 0.8 }] }, { k: 'cloud', p: [{ x: 0.4, y: 0.3 }, { x: 0.2, y: 0.5 }] }]))
      .toEqual({ x: 0.2, y: 0.3 })
    expect(redlineAnchor([])).toBeNull()
  })

  it('la nube es un camino cerrado de festones', () => {
    const d = cloudPath({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, size, 20)
    expect(d.startsWith('M100.00 80.00')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect((d.match(/A/g) ?? []).length).toBeGreaterThanOrEqual(4 * 4)
  })

  it('la nube del PDF rodea el rectángulo por fuera', () => {
    const pts = cloudPoints({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, size, 20)
    expect(pts.length).toBeGreaterThan(16)
    const minY = Math.min(...pts.map(p => p.y)), maxX = Math.max(...pts.map(p => p.x))
    expect(minY).toBeLessThanOrEqual(80) // arriba del borde superior (y = 80)
    expect(maxX).toBeGreaterThanOrEqual(200) // a la derecha del borde derecho (x = 200)
  })

  it('tocar: dentro de la nube, cerca del trazo o del punto', () => {
    const cloud: RedlineMark[] = [{ k: 'cloud', p: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] }]
    expect(hitsRedline({ x: 0.2, y: 0.2 }, cloud, size)).toBe(true)
    expect(hitsRedline({ x: 0.5, y: 0.5 }, cloud, size)).toBe(false)
    const pen: RedlineMark[] = [{ k: 'pen', p: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }] }]
    expect(hitsRedline({ x: 0.3, y: 0.505 }, pen, size)).toBe(true)
  })
})

describe('red-line: revisión y conteos', () => {
  it('revisa otra persona, Líder en adelante, solo abierta (= review_pid_redline)', () => {
    expect(canReviewRedline({ status: 'open', created_by: 'a' }, 'b', true)).toBe(true)
    expect(canReviewRedline({ status: 'open', created_by: 'a' }, 'a', true)).toBe(false)
    expect(canReviewRedline({ status: 'open', created_by: 'a' }, 'b', false)).toBe(false)
    expect(canReviewRedline({ status: 'accepted', created_by: 'a' }, 'b', true)).toBe(false)
  })

  it('cuenta por estado', () => {
    expect(countByStatus([{ status: 'open' }, { status: 'open' }, { status: 'rejected' }]))
      .toEqual({ open: 2, accepted: 0, rejected: 1, incorporated: 0 })
  })
})
