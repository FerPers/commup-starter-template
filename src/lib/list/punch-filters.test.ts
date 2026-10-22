import { describe, expect, it } from 'vitest'
import { punchFiltersFromSearch, punchFiltersQuery } from './punch-filters'

describe('filtros de la lista de punch ↔ URL (G-14)', () => {
  it('el Excel recibe los mismos filtros que la pantalla', () => {
    const qs = punchFiltersQuery({ cat: 'A', status: '', q: 'PT-101', project: 'p1', assigned: 'me' })
    expect(qs).toBe('?cat=A&q=PT-101&project=p1&assigned=me')
    expect(punchFiltersFromSearch(new URLSearchParams(qs), 'u1')).toEqual({ cat: 'A', q: 'PT-101', project: 'p1', assigned: 'u1' })
  })
  it('sin filtros no hay query y assigned solo acepta «me»', () => {
    expect(punchFiltersQuery({})).toBe('')
    expect(punchFiltersFromSearch(new URLSearchParams('assigned=otro'), 'u1').assigned).toBeUndefined()
  })
})
