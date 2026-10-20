import { describe, expect, it } from 'vitest'
import { ISSUED_STATUSES, currentRevision, documentPath, documentPolicy, isControlledStatus, isDocumentPathFor, isHttpsUrl, isOutdated } from './catalog'

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

  it('S13 (F-03): vigente = fecha de emisión más reciente, no la última registrada', () => {
    const revs = [
      { id: 'C', seq: 1, status: 'ifc', issued_on: '2026-10-10' },
      { id: 'A', seq: 2, status: 'ifr', issued_on: '2026-09-01' },
      { id: 'B', seq: 3, status: 'ifc', issued_on: '2026-09-15' },
    ]
    expect(currentRevision(revs)?.id).toBe('C')
    expect(currentRevision([...revs, { id: 'D', seq: 4, status: 'ifc', issued_on: '2026-10-10' }])?.id).toBe('D')
    expect(currentRevision(revs.map(r => r.id === 'C' ? { ...r, status: 'void' } : r))?.id).toBe('B')
    expect(currentRevision([{ id: 'X', seq: 1, status: 'draft', issued_on: null }])).toBeNull()
  })

  it('S13 (F-20): política IFR/IFA y estados controlados', () => {
    expect(documentPolicy(null)).toEqual({ below_ifc: 'warn' })
    expect(documentPolicy({ document_policy: { below_ifc: 'block' } })).toEqual({ below_ifc: 'block' })
    expect(documentPolicy({ document_policy: { below_ifc: 'otro' } })).toEqual({ below_ifc: 'warn' })
    expect(isControlledStatus('ifc')).toBe(true)
    expect(isControlledStatus('ifa')).toBe(false)
    expect(isControlledStatus(null)).toBe(false)
  })
})
