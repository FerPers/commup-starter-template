import { describe, expect, it } from 'vitest'
import { setupInputSchema } from './schema'

const valid = {
  userFullName: 'Ana Pérez',
  org: { name: 'Acme', slug: 'acme' },
  project: { name: 'P1', code: 'p1', location: '', client: '', country: 'CO', region: '', start_date: '', end_date: '2027-01-31' },
  phases: [{ code: 'A', name: 'MC', order_index: 1, color: '#3b82f6', certificate_name: 'MC' }],
  disciplines: [{ code: 'ELEC', name: 'Electrical', color: '#f59e0b' }],
}

describe('setupInputSchema (A-20)', () => {
  it('acepta la entrada del asistente', () => {
    expect(setupInputSchema.safeParse(valid).success).toBe(true)
  })
  it('descarta columnas de más en fases y disciplinas', () => {
    const r = setupInputSchema.parse({
      ...valid,
      phases: [{ ...valid.phases[0], id: '00000000-0000-0000-0000-000000000000', org_id: 'x' }],
      disciplines: [{ ...valid.disciplines[0], is_active: false }],
    })
    expect(Object.keys(r.phases[0]).sort()).toEqual(['certificate_name', 'code', 'color', 'name', 'order_index'])
    expect(Object.keys(r.disciplines[0]).sort()).toEqual(['code', 'color', 'name'])
  })
  it('limita longitudes y cantidades', () => {
    expect(setupInputSchema.safeParse({ ...valid, org: { name: 'x'.repeat(500), slug: 'acme' } }).success).toBe(false)
    expect(setupInputSchema.safeParse({ ...valid, phases: Array(21).fill(valid.phases[0]) }).success).toBe(false)
    expect(setupInputSchema.safeParse({ ...valid, org: { name: 'Acme', slug: '../x' } }).success).toBe(false)
    expect(setupInputSchema.safeParse({ ...valid, phases: [{ ...valid.phases[0], color: 'red;}' }] }).success).toBe(false)
  })
})
