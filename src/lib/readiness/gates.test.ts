import { describe, expect, it } from 'vitest'
import { canApprove, canRevoke, evidencePath, gatePolicy, isApproved, isEvidencePathFor, missingSignatures, parseConditions, signableCapacities, type Approval } from './gates'

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
    const approval: Approval = { id: 'a', status: 'approved', target_status: 'approved', signatures: [], conditions: [], notes: null, approved_by: 'u', approved_role: 'architect', approved_at: '' }
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

describe('co-firmas Operaciones + HSE', () => {
  const sig = (capacity: 'commissioning' | 'operations' | 'hse', user_id: string) => ({ capacity, user_id, user_role: 'owner', comments: null, signed_at: '' })
  const gate = (signatures: ReturnType<typeof sig>[]) => ({
    status: 'pending_signatures' as const,
    required_signatures: ['operations', 'hse'],
    cosign_roles: ['owner', 'leader'],
    approval: { id: 'a', status: 'pending_signatures' as const, target_status: 'approved' as const, signatures, conditions: [], notes: null, approved_by: 'u1', approved_role: 'owner', approved_at: '' },
  })

  it('faltan las firmas no registradas', () => {
    expect(missingSignatures(gate([sig('commissioning', 'u1')]))).toEqual(['operations', 'hse'])
    expect(missingSignatures(gate([sig('commissioning', 'u1'), sig('operations', 'u2')]))).toEqual(['hse'])
  })

  it('quien ya firmó no puede firmar otra vez; rol fuera de cosign_roles tampoco', () => {
    const g = gate([sig('commissioning', 'u1')])
    expect(signableCapacities(g, 'owner', 'u1')).toEqual([])
    expect(signableCapacities(g, 'owner', 'u2')).toEqual(['operations', 'hse'])
    expect(signableCapacities(g, 'inspector', 'u3')).toEqual([])
  })
})

describe('gatePolicy (S11 + R5)', () => {
  it('por defecto: anterior en regresión bloquea, proveedor es condición, requisitos faltantes son condición', () => {
    expect(gatePolicy(null)).toEqual({ regressed_previous: 'block', regressed_dependency: 'condition', cat_a_regresses_approved: false, missing_requirements: 'warn' })
  })
  it('acepta off y block para los requisitos; lo desconocido vuelve a warn', () => {
    expect(gatePolicy({ gate_policy: { missing_requirements: 'block' } }).missing_requirements).toBe('block')
    expect(gatePolicy({ gate_policy: { missing_requirements: 'off' } }).missing_requirements).toBe('off')
    expect(gatePolicy({ gate_policy: { missing_requirements: 'nope' } }).missing_requirements).toBe('warn')
  })
})
