import { describe, expect, it } from 'vitest'
import { groupHits, hrefFor, parseRecents, projectFromPath, pushRecent, toHits, type SearchRow } from './catalog'

const P = 'abc47484-59d3-4f51-8966-7fb4f1174ba8'
const row = (kind: string, ref: string, rank: number, extra: string | null = null): SearchRow =>
  ({ kind, id: `id-${ref}`, project_id: P, ref, title: null, extra_id: extra, rank })

describe('búsqueda ⌘K (N3a)', () => {
  it('cada tipo abre su ficha; un ITR sin tag cae en la lista filtrada', () => {
    expect(hrefFor(row('tq', 'TQ-0042', 0))).toBe(`/projects/${P}/daily/tq/id-TQ-0042`)
    expect(hrefFor(row('itr', 'ITR-1', 1, 'tag-1'))).toBe(`/projects/${P}/tags/tag-1/itrs/id-ITR-1`)
    expect(hrefFor(row('itr', 'ITR 2', 1))).toBe(`/projects/${P}/itrs?q=ITR%202`)
    expect(hrefFor(row('ptc', 'PTC-0001', 0, 'run-9'))).toBe(`/projects/${P}/startup/performance/runs/run-9`)
    expect(hrefFor(row('bogus', 'X', 0))).toBeNull()
    expect(toHits([row('bogus', 'X', 0), row('punch', 'P-1', 1)]).map(h => h.kind)).toEqual(['punch'])
  })

  it('el grupo del número exacto va primero; dentro, exacto → empieza → contiene con orden numérico', () => {
    const groups = groupHits(toHits([row('tag', 'PT-10', 2), row('tag', 'PT-2', 1), row('tag', 'PT-10A', 1), row('tq', 'TQ-0042', 0)]))
    expect(groups.map(g => g.kind)).toEqual(['tq', 'tag'])
    expect(groups[1].hits.map(h => h.ref)).toEqual(['PT-2', 'PT-10A', 'PT-10'])
  })

  it('proyecto de la ruta', () => {
    expect(projectFromPath(`/projects/${P}/tags`)).toBe(P)
    expect(projectFromPath(`/projects/${P}`)).toBe(P)
    expect(projectFromPath('/my-work')).toBeNull()
  })

  it('recientes: sin repetir, con tope y tolerando basura', () => {
    const a = { kind: 'tag' as const, ref: 'PT-101', title: null, href: '/projects/x/tags/1' }
    const b = { kind: 'punch' as const, ref: 'P-1', title: null, href: '/projects/x/punches/1' }
    expect(pushRecent([a, b], a).map(r => r.ref)).toEqual(['PT-101', 'P-1'])
    expect(pushRecent([b], a, 1).map(r => r.ref)).toEqual(['PT-101'])
    expect(parseRecents('{"x":1}')).toEqual([])
    expect(parseRecents('not json')).toEqual([])
    expect(parseRecents(JSON.stringify([a, { kind: 'tag', ref: 'X', href: 'https://evil' }]))).toEqual([a])
  })
})
