import { describe, expect, it } from 'vitest'
import { actionNeedsEvidence, compareActions, daysOverdue, evidencePath, isOverdue, todayIso } from './catalog'

describe('gestión diaria — catálogo', () => {
  it('evidencia obligatoria salvo método revisión', () => {
    expect(actionNeedsEvidence('review')).toBe(false)
    expect(actionNeedsEvidence('field')).toBe(true)
    expect(actionNeedsEvidence('document')).toBe(true)
    expect(actionNeedsEvidence('test')).toBe(true)
  })

  it('vencimiento y días de atraso', () => {
    expect(isOverdue('2026-10-15', '2026-10-16')).toBe(true)
    expect(isOverdue('2026-10-16', '2026-10-16')).toBe(false)
    expect(isOverdue(null, '2026-10-16')).toBe(false)
    expect(daysOverdue('2026-10-10', '2026-10-16')).toBe(6)
    expect(daysOverdue('2026-10-20', '2026-10-16')).toBe(0)
  })

  it('todayIso usa la fecha local', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('ruta de evidencia con el prefijo que exige la política', () => {
    const p = evidencePath('P', 'action', 'A', 'Foto placa (1).jpg', 123)
    expect(p).toBe('P/action/A/123-Foto_placa_1_.jpg')
    expect(evidencePath('P', 'tq', 'T', '', 1)).toBe('P/tq/T/1-archivo')
  })

  it('orden del tracker: vencidas, prioridad, fecha, número', () => {
    const today = '2026-10-16'
    const rows = [
      { number: 'ACC-0003', priority: 'low' as const, due_date: '2026-10-01' },
      { number: 'ACC-0001', priority: 'critical' as const, due_date: '2026-10-30' },
      { number: 'ACC-0002', priority: 'critical' as const, due_date: null },
      { number: 'ACC-0004', priority: 'high' as const, due_date: '2026-10-20' },
    ]
    expect([...rows].sort((a, b) => compareActions(a, b, today)).map(r => r.number))
      .toEqual(['ACC-0003', 'ACC-0001', 'ACC-0002', 'ACC-0004'])
  })
})
