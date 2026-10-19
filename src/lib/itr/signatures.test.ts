import { describe, expect, it } from 'vitest'
import { allRequiredSigned, assignmentError, availableSigningRoles, nextSigningRole, normalizeRequired, requiredForTemplate } from './signatures'

describe('firmas requeridas del ITR (S04)', () => {
  it('normaliza: orden fijo, ejecutor siempre, vacío = por defecto', () => {
    expect(normalizeRequired(['client', 'executor'])).toEqual(['executor', 'client'])
    expect(normalizeRequired(['supervisor'])).toEqual(['executor', 'supervisor'])
    expect(normalizeRequired([])).toEqual(['executor', 'supervisor'])
    expect(normalizeRequired(null)).toEqual(['executor', 'supervisor'])
    expect(normalizeRequired(['executor', 'bogus'])).toEqual(['executor'])
  })

  it('la fase puede sumar el cliente (D4)', () => {
    expect(requiredForTemplate(['executor', 'supervisor'], false)).toEqual(['executor', 'supervisor'])
    expect(requiredForTemplate(['executor', 'supervisor'], true)).toEqual(['executor', 'supervisor', 'client'])
    expect(requiredForTemplate(['executor'], true)).toEqual(['executor', 'client'])
  })

  it('siguiente firma salta los roles no pedidos y aprueba con todas', () => {
    expect(nextSigningRole(['executor', 'supervisor'], [])).toBe('executor')
    expect(nextSigningRole(['executor', 'supervisor'], ['executor'])).toBe('supervisor')
    expect(nextSigningRole(['executor', 'client'], ['executor'])).toBe('client')
    expect(allRequiredSigned(['executor', 'supervisor'], ['executor', 'supervisor'])).toBe(true)
    expect(allRequiredSigned(['executor', 'supervisor', 'client'], ['executor', 'supervisor'])).toBe(false)
  })

  it('solo el asignado al siguiente rol puede firmar, y no dos veces (D6)', () => {
    const assignments = [{ role: 'executor', user_id: 'A' }, { role: 'supervisor', user_id: 'B' }]
    expect(availableSigningRoles(['executor', 'supervisor'], assignments, [], 'A')).toEqual(['executor'])
    expect(availableSigningRoles(['executor', 'supervisor'], assignments, [], 'B')).toEqual([])
    expect(availableSigningRoles(['executor', 'supervisor'], assignments, [{ role: 'executor', user_id: 'A' }], 'B')).toEqual(['supervisor'])
    // Asignación heredada a la misma persona: firmó como ejecutor, no puede firmar como supervisor.
    const same = [{ role: 'executor', user_id: 'A' }, { role: 'supervisor', user_id: 'A' }]
    expect(availableSigningRoles(['executor', 'supervisor'], same, [{ role: 'executor', user_id: 'A' }], 'A')).toEqual([])
    // Sin supervisor asignado no hay a quién le toque.
    expect(availableSigningRoles(['executor', 'supervisor'], [assignments[0]], [{ role: 'executor', user_id: 'A' }], 'B')).toEqual([])
  })

  it('valida asignaciones: requeridas completas y personas distintas', () => {
    expect(assignmentError(['executor', 'supervisor'], { executor: 'A', supervisor: 'B' })).toBeNull()
    expect(assignmentError(['executor', 'supervisor'], { executor: 'A' })).toMatch(/supervisor/)
    expect(assignmentError(['executor', 'supervisor', 'client'], { executor: 'A', supervisor: 'B' })).toMatch(/cliente/)
    expect(assignmentError(['executor', 'supervisor'], { executor: 'A', supervisor: 'A' })).toMatch(/misma persona/)
    expect(assignmentError(['executor'], { executor: 'A', supervisor: 'A' })).toBeNull()
  })
})
