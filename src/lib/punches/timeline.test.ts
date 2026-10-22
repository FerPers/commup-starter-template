import { describe, expect, it } from 'vitest'
import { buildPunchTimeline, classifyPunchComment } from './timeline'

describe('historia del punch (N1b)', () => {
  it('reconoce los comentarios que dejan las RPC de transición', () => {
    expect(classifyPunchComment('Resuelto: se cambió la junta')).toEqual({ kind: 'resolved', text: 'se cambió la junta' })
    expect(classifyPunchComment('Verificado en campo y cerrado.')).toEqual({ kind: 'verified', text: '' })
    expect(classifyPunchComment('Verificado en campo y cerrado: ok')).toEqual({ kind: 'verified', text: 'ok' })
    expect(classifyPunchComment('Verificación rechazada: sigue goteando')).toEqual({ kind: 'rejected', text: 'sigue goteando' })
    expect(classifyPunchComment('Cancelado: duplicado de P-0007')).toEqual({ kind: 'cancelled', text: 'duplicado de P-0007' })
    expect(classifyPunchComment('Recategorizado B → A: afecta el arranque').kind).toBe('reviewed')
    expect(classifyPunchComment('Categoría C confirmada.').kind).toBe('reviewed')
    expect(classifyPunchComment('Llegó el repuesto')).toEqual({ kind: 'comment', text: 'Llegó el repuesto' })
  })

  it('ordena por fecha con el alta primero y solo toma reasignaciones del registro de actividad', () => {
    const tl = buildPunchTimeline({
      punch: { id: 'p1', created_at: '2026-10-01T10:00:00Z', raised_by: 'u1' },
      comments: [
        { id: 'c2', user_id: 'u2', comment: 'Resuelto: listo', created_at: '2026-10-03T10:00:00Z' },
        { id: 'c1', user_id: 'u1', comment: 'Foto agregada', created_at: '2026-10-01T10:00:00Z' },
      ],
      activity: [
        { id: 'a1', user_id: 'u9', action: 'reassigned', payload: { from: null, to: 'u2' }, created_at: '2026-10-02T09:00:00Z' },
        { id: 'a2', user_id: 'u9', action: 'resolved', payload: {}, created_at: '2026-10-03T10:00:00Z' },
      ],
    })
    expect(tl.map(e => e.kind)).toEqual(['created', 'comment', 'reassigned', 'resolved'])
    expect(tl[2]).toMatchObject({ from: null, to: 'u2', userId: 'u9' })
  })
})
