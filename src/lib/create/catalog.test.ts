import { describe, expect, it } from 'vitest'
import { createContextFromPath, createHref, createKindsFor, safeBack } from './catalog'

const P = 'abc47484-59d3-4f51-8966-7fb4f1174ba8'
const T = '11111111-2222-4333-8444-555555555555'

describe('＋ Crear (N3b)', () => {
  it('opciones por rol: cliente nada, inspector lo de campo, líder+ todo', () => {
    expect(createKindsFor('client')).toEqual([])
    expect(createKindsFor('inspector')).toEqual(['punch', 'register', 'event'])
    expect(createKindsFor('leader')).toHaveLength(6)
    expect(createKindsFor(null)).toEqual([])
  })

  it('el contexto sale de la ruta', () => {
    expect(createContextFromPath(`/projects/${P}/tags/${T}`)).toEqual({ projectId: P, tagId: T, systemId: null })
    expect(createContextFromPath(`/projects/${P}/systems/${T}?tab=gates`.split('?')[0])).toEqual({ projectId: P, tagId: null, systemId: T })
    expect(createContextFromPath(`/projects/${P}/tags/labels`)).toEqual({ projectId: P, tagId: null, systemId: null })
    expect(createContextFromPath('/my-work')).toEqual({ projectId: null, tagId: null, systemId: null })
  })

  it('cada alta lleva su contexto; desde un tag el punch vuelve a su pestaña', () => {
    const fromTag = { projectId: P, tagId: T, systemId: null }
    const punch = new URL(createHref('punch', fromTag), 'https://x')
    expect(punch.pathname).toBe(`/projects/${P}/punches/new`)
    expect(punch.searchParams.get('tag')).toBe(T)
    expect(punch.searchParams.get('back')).toBe(`/projects/${P}/tags/${T}?tab=punches`)
    expect(createHref('tq', fromTag)).toBe(`/projects/${P}/daily/new?tag=${T}&kind=tq`)
    expect(createHref('event', { projectId: P, tagId: null, systemId: T })).toBe(`/projects/${P}/startup/events?system=${T}&new=1`)
    expect(createHref('register', { projectId: P, tagId: null, systemId: T })).toBe(`/projects/${P}/registers/new?systemId=${T}`)
    expect(createHref('punch', { projectId: P, tagId: null, systemId: null }, '/my-work')).toBe(`/projects/${P}/punches/new?back=%2Fmy-work`)
  })

  it('solo vuelve a rutas internas', () => {
    expect(safeBack('/my-work')).toBe('/my-work')
    expect(safeBack('//evil.com')).toBeNull()
    expect(safeBack('https://evil.com')).toBeNull()
    expect(safeBack('/\\evil.com')).toBeNull()
    expect(safeBack(undefined)).toBeNull()
  })
})
