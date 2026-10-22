import { describe, expect, it } from 'vitest'
import { clientCodeChanges, effectiveClientCode } from './client-codes'

describe('effectiveClientCode', () => {
  it('el del proyecto gana; sin él, el de la org', () => {
    expect(effectiveClientCode({ org: 'ORG-1', project: 'PRJ-1' })).toBe('PRJ-1')
    expect(effectiveClientCode({ org: 'ORG-1', project: null })).toBe('ORG-1')
    expect(effectiveClientCode({ org: null, project: null })).toBeNull()
  })
})

describe('clientCodeChanges', () => {
  const rows = [
    { code: 'E13B', org: 'ECP-132', project: null },
    { code: 'E22B', org: null, project: 'PRJ-22' },
  ]
  it('solo viaja lo que cambió, por nivel; vacío = quitar', () => {
    const c = clientCodeChanges(rows, {
      E13B: { org: ' ECP-132 ', project: 'X-1' },
      E22B: { project: '' },
    })
    expect(c).toEqual({ org: {}, project: { E13B: 'X-1', E22B: '' }, count: 2 })
  })
  it('sin borradores no hay cambios', () => {
    expect(clientCodeChanges(rows, {}).count).toBe(0)
  })
})
