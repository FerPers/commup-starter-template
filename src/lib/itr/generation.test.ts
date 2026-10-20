import { describe, expect, it } from 'vitest'
import { cleanAssignment, disciplineKey, scopeIds } from './generation'

describe('generación masiva de ITR (S19)', () => {
  it('quita vacíos y rechaza la misma persona en dos roles', () => {
    expect(cleanAssignment({ d1: { executor: 'a', supervisor: '' }, d2: { executor: '' } })).toEqual({ assign: { d1: { executor: 'a' } } })
    expect(cleanAssignment({ d1: { executor: 'a', supervisor: 'a' } })).toEqual({ error: 'same_person' })
  })

  it('alcance: solo uuid, sin repetir; vacío = todo el proyecto', () => {
    const id = '6d4a5cff-7487-440d-945d-0d178486caa5'
    expect(scopeIds([id, id, 'x'])).toEqual([id])
    expect(scopeIds([])).toBeNull()
    expect(disciplineKey(null)).toBe('none')
  })
})
