import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CAPACITIES, CAPACITY_FALLBACK_ROLES, can, capacityIneligible, fallbackCapacities, toMyCapacities } from './capacities'
import { HOLD_RELEASE_ROLES } from '@/lib/startup/catalog'

describe('capacidades de firma (S14, D14)', () => {
  it('el respaldo TS es igual al SQL capacity_fallback_roles() (I-15: una sola fuente)', () => {
    const sql = readFileSync('supabase/functions-sql/capacity_fallback_roles.sql', 'utf8')
    for (const c of CAPACITIES) {
      const m = sql.match(new RegExp(`WHEN '${c}'\\s+THEN ARRAY\\[([^\\]]*)\\]`))
      expect(m, c).not.toBeNull()
      const roles = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])
      expect(roles).toEqual([...CAPACITY_FALLBACK_ROLES[c]])
    }
  })

  it('los hold points usan la misma fuente', () => {
    expect(HOLD_RELEASE_ROLES.operations).toBe(CAPACITY_FALLBACK_ROLES.operations)
    expect(HOLD_RELEASE_ROLES.commissioning).toBe(CAPACITY_FALLBACK_ROLES.commissioning)
  })

  it('respaldo por rol y filas de my_capacities', () => {
    expect(can(fallbackCapacities('client'), 'operations')).toBe(true)
    expect(can(fallbackCapacities('client'), 'commissioning')).toBe(false)
    expect(can(fallbackCapacities('inspector'), 'operations')).toBe(false)
    const caps = toMyCapacities([{ capacity: 'operations', allowed: true, designated: true }, { capacity: 'otra', allowed: true, designated: true }])
    expect(caps.operations).toEqual({ allowed: true, designated: true })
    expect(caps.hse).toEqual({ allowed: false, designated: false })
    expect(can(caps, 'otra')).toBe(false)
  })

  it('piso para designar (= SQL capacity_eligible)', () => {
    expect(capacityIneligible('commissioning', { role: 'client', companyKind: null })).toBe('client_commissioning')
    expect(capacityIneligible('client_rep', { role: 'inspector', companyKind: 'owner' })).toBeNull()
    expect(capacityIneligible('client_rep', { role: 'leader', companyKind: 'epc' })).toBe('client_rep_company')
    expect(capacityIneligible('operations', { role: 'inspector', companyKind: null })).toBeNull()
  })
})
