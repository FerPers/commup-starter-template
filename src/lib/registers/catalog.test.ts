import { describe, expect, it } from 'vitest'
import { REGISTER_CATALOG, cleanRegisterData, missingFieldsFor, transitionBlockedReason } from './catalog'

describe('catálogo de registros', () => {
  it('seis tipos con prefijos únicos de 3 letras (la BD los repite en ensure_register_types)', () => {
    expect(REGISTER_CATALOG.map(t => `${t.kind}:${t.prefix}:${t.defaultBlocks}`)).toEqual([
      'temporary:TMP:penultimate', 'blind:CIE:penultimate', 'reinstatement:REI:last',
      'bypass:BYP:last', 'energization:ENE:null', 'test_pack:TPK:first',
    ])
  })

  it('cleanRegisterData: solo claves del tipo, números y opciones válidas, textos recortados', () => {
    expect(cleanRegisterData('test_pack', {
      test_type: 'hydrostatic', medium: 'lava', test_pressure: '15,5', hold_minutes: 'x', witness: '  QA Geopark ', hack: 1,
    })).toEqual({ test_type: 'hydrostatic', test_pressure: 15.5, witness: 'QA Geopark' })
    expect(cleanRegisterData('energization', { energized_on: '2026-10-15', certificate: '' })).toEqual({ energized_on: '2026-10-15' })
    expect(cleanRegisterData('energization', { energized_on: '15/10/2026' })).toEqual({})
  })

  it('missingFieldsFor acumula los requeridos hasta el estado destino', () => {
    const data = { test_type: 'hydrostatic', medium: 'water', test_pressure: 15, hold_minutes: 30 }
    expect(missingFieldsFor('test_pack', 'authorized', data)).toEqual([])
    expect(missingFieldsFor('test_pack', 'active', data)).toEqual(['achieved_pressure', 'result', 'witness'])
    expect(missingFieldsFor('bypass', 'verified', {})).toContain('restoration_check')
    expect(missingFieldsFor('blind', 'cancelled', {})).toEqual([])
  })

  it('un test pack rechazado no se restituye ni se verifica', () => {
    expect(transitionBlockedReason('test_pack', 'verified', { result: 'rejected' })).toBe('test_rejected')
    expect(transitionBlockedReason('test_pack', 'removed', { result: 'rejected' })).toBe('test_rejected')
    expect(transitionBlockedReason('test_pack', 'verified', { result: 'accepted' })).toBeNull()
    expect(transitionBlockedReason('blind', 'verified', { result: 'rejected' })).toBeNull()
  })
})
