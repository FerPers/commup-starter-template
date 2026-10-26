import { describe, expect, it } from 'vitest'
import { setupInputSchema } from './schema'
import { ALL_DISCIPLINES, DEFAULT_PHASES, NEW_DISCIPLINE_COLOR, NEW_PHASE_COLOR } from './defaults'

describe('valores por defecto del alta (colores que van a la BD)', () => {
  it('el alta con las fases y disciplinas por defecto pasa la validación', () => {
    const r = setupInputSchema.safeParse({
      userFullName: 'Ana Pérez',
      org: { name: 'Acme', slug: 'acme' },
      project: { name: 'P1', code: 'P1', location: '', client: '', country: '', region: '', start_date: '', end_date: '' },
      phases: DEFAULT_PHASES,
      disciplines: ALL_DISCIPLINES.map(({ code, name, color }) => ({ code, name, color })),
    })
    expect(r.success).toBe(true)
  })
  it('el color inicial de Configuración es hex, nunca un token', () => {
    for (const c of [NEW_PHASE_COLOR, NEW_DISCIPLINE_COLOR]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
