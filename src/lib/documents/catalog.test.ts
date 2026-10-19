import { describe, expect, it } from 'vitest'
import { ISSUED_STATUSES, documentPath, isDocumentPathFor, isHttpsUrl, isOutdated } from './catalog'

describe('documents catalog', () => {
  it('emitidos excluye el borrador', () => {
    expect(ISSUED_STATUSES).toEqual(['ifr', 'ifa', 'ifc', 'as_built', 'final'])
  })

  it('arma y valida la ruta del bucket', () => {
    const p = documentPath('proj', 'doc', 'P&ID Compresión rev B.pdf', 'abc')
    expect(p).toBe('proj/doc/abc-P_ID_Compresion_rev_B.pdf')
    expect(isDocumentPathFor(p, 'proj', 'doc')).toBe(true)
    expect(isDocumentPathFor(p, 'otro', 'doc')).toBe(false)
    expect(isDocumentPathFor('proj/doc/../x', 'proj', 'doc')).toBe(false)
  })

  it('solo acepta enlaces https', () => {
    expect(isHttpsUrl('https://edms.example.com/doc/1')).toBe(true)
    expect(isHttpsUrl('http://edms.example.com')).toBe(false)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
  })

  it('referencia superada = otra revisión vigente', () => {
    expect(isOutdated({ revision_id: 'a' }, 'a')).toBe(false)
    expect(isOutdated({ revision_id: 'a' }, 'b')).toBe(true)
    expect(isOutdated({ revision_id: 'a' }, null)).toBe(false)
  })
})
