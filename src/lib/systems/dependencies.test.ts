import { describe, expect, it } from 'vitest'
import { cleanBatteryLimits, createsCycle, defaultDependencyGates, enablingSystemIds } from './dependencies'

const gates = [
  { id: 'rfsu', code: 'RFSU', order_index: 40, is_active: true },
  { id: 'mc', code: 'MC', order_index: 10, is_active: true },
  { id: 'rfc', code: 'RFC', order_index: 30, is_active: true },
  { id: 'rfpc', code: 'RFPC', order_index: 20, is_active: true },
]

describe('defaultDependencyGates', () => {
  it('utility: proveedor en servicio (último) antes de comisionar el dependiente (penúltimo)', () => {
    expect(defaultDependencyGates('utility', gates)).toEqual({ requiredGateId: 'rfsu', blockedGateId: 'rfc' })
  })

  it('utility: usa el gate UTILITY si la org lo activó', () => {
    const withUtility = [...gates, { id: 'ut', code: 'UTILITY', order_index: 25, is_active: true }]
    expect(defaultDependencyGates('utility', withUtility)).toEqual({ requiredGateId: 'ut', blockedGateId: 'rfc' })
    const inactive = [...gates, { id: 'ut', code: 'UTILITY', order_index: 25, is_active: false }]
    expect(defaultDependencyGates('utility', inactive)).toEqual({ requiredGateId: 'rfsu', blockedGateId: 'rfc' })
  })

  it('proceso y otro: arranque aguas arriba antes del arranque', () => {
    expect(defaultDependencyGates('process', gates)).toEqual({ requiredGateId: 'rfsu', blockedGateId: 'rfsu' })
    expect(defaultDependencyGates('other', gates)).toEqual({ requiredGateId: 'rfsu', blockedGateId: 'rfsu' })
  })

  it('funciona con códigos de otra org y con un solo gate; sin gates no hay default', () => {
    const abc = [{ id: 'a', code: 'A', order_index: 10, is_active: true }, { id: 'b', code: 'B', order_index: 20, is_active: true }]
    expect(defaultDependencyGates('utility', abc)).toEqual({ requiredGateId: 'b', blockedGateId: 'a' })
    expect(defaultDependencyGates('utility', [abc[0]])).toEqual({ requiredGateId: 'a', blockedGateId: 'a' })
    expect(defaultDependencyGates('process', [])).toBeNull()
  })
})

describe('createsCycle', () => {
  const edges = [
    { system_id: 'compresion', depends_on_system_id: 'aire' },
    { system_id: 'aire', depends_on_system_id: 'potencia' },
  ]

  it('detecta ciclos directos, indirectos y autodependencia', () => {
    expect(createsCycle(edges, 'potencia', 'compresion')).toBe(true)
    expect(createsCycle(edges, 'aire', 'compresion')).toBe(true)
    expect(createsCycle(edges, 'aire', 'aire')).toBe(true)
  })

  it('permite dependencias que no cierran ciclo', () => {
    expect(createsCycle(edges, 'compresion', 'potencia')).toBe(false)
    expect(createsCycle(edges, 'tea', 'aire')).toBe(false)
  })
})

describe('enablingSystemIds / cleanBatteryLimits', () => {
  it('habilitantes = proveedores de alguna dependencia', () => {
    expect([...enablingSystemIds([{ depends_on_system_id: 'aire' }, { depends_on_system_id: 'aire' }, { depends_on_system_id: 'n2' }])].sort()).toEqual(['aire', 'n2'])
  })

  it('límites: solo claves conocidas, recortadas y sin vacíos', () => {
    expect(cleanBatteryLimits({ inlet: '  brida 6" ', outlet: '', hack: 'x', notes: 3 })).toEqual({ inlet: 'brida 6"' })
    expect(cleanBatteryLimits({ notes: 'x'.repeat(1200) }).notes).toHaveLength(1000)
  })
})
