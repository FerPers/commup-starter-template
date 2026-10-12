import { describe, expect, it } from 'vitest'
import { canApprove, canRevoke, evidencePath, isApproved, isEvidencePathFor, parseConditions } from './gates'

const roles = ['owner', 'admin', 'architect']

describe('canApprove / canRevoke', () => {
  it('solo gates listos y con rol autorizado', () => {
    expect(canApprove({ status: 'ready', approval_roles: roles }, 'architect')).toBe(true)
    expect(canApprove({ status: 'ready_with_conditions', approval_roles: roles }, 'admin')).toBe(true)
    expect(canApprove({ status: 'ready', approval_roles: roles }, 'leader')).toBe(false)
    expect(canApprove({ status: 'not_ready', approval_roles: roles }, 'owner')).toBe(false)
    expect(canApprove({ status: 'approved', approval_roles: roles }, 'owner')).toBe(false)
  })

  it('revocar: owner/admin siempre; otros si aprueban ese gate', () => {
    const approval = { id: 'a', status: 'approved' as const, conditions: [], notes: null, approved_by: 'u', approved_role: 'architect', approved_at: '' }
    expect(canRevoke({ approval, approval_roles: ['architect'] }, 'admin')).toBe(true)
    expect(canRevoke({ approval, approval_roles: ['architect'] }, 'architect')).toBe(true)
    expect(canRevoke({ approval, approval_roles: ['architect'] }, 'leader')).toBe(false)
    expect(canRevoke({ approval: null, approval_roles: roles }, 'owner')).toBe(false)
  })

  it('regresión cuenta como aprobado', () => {
    expect(isApproved('regressed')).toBe(true)
    expect(isApproved('ready')).toBe(false)
  })
})

describe('parseConditions', () => {
  it('una por línea, sin vacías, con tope', () => {
    expect(parseConditions(' a \n\n b\n')).toEqual(['a', 'b'])
    expect(parseConditions(Array.from({ length: 30 }, (_, i) => `c${i}`).join('\n'))).toHaveLength(20)
    expect(parseConditions('x'.repeat(600))[0]).toHaveLength(500)
  })
})

describe('evidencePath', () => {
  it('sanea el nombre y queda dentro de la carpeta del sistema', () => {
    const p = evidencePath('org', 'sys', 'Acta firmada (ñ).pdf', 'id1')
    expect(p).toBe('org/sys/id1-Acta_firmada_n_.pdf')
    expect(isEvidencePathFor(p, 'org', 'sys')).toBe(true)
    expect(isEvidencePathFor('org/otro/x.pdf', 'org', 'sys')).toBe(false)
    expect(isEvidencePathFor('org/sys/../otro/x.pdf', 'org', 'sys')).toBe(false)
  })
})
