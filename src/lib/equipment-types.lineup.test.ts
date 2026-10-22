import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CRITICAL_VALVE_CODES, defaultLineupFlags } from './equipment-types'

describe('flags de line-up por tipo de equipo (S25b, E-29)', () => {
  it('los códigos críticos son los del backfill SQL', () => {
    const sql = readFileSync('supabase/migrations/20261123120000_startup_field_ux_s25b.sql', 'utf8')
    const m = sql.match(/critical_valve\s+= code IN \(([^)]*)\)/)
    expect([...m![1].matchAll(/'([A-Z-]+)'/g)].map(x => x[1])).toEqual([...CRITICAL_VALVE_CODES])
  })
  it('candidatas por categoría (es/en) o por ser críticas', () => {
    expect(defaultLineupFlags('HV', 'Válvulas')).toEqual({ lineup_candidate: true, critical_valve: false })
    expect(defaultLineupFlags('esdv', 'Control y seguridad')).toEqual({ lineup_candidate: true, critical_valve: true })
    expect(defaultLineupFlags('P', 'Rotativos')).toEqual({ lineup_candidate: false, critical_valve: false })
    expect(defaultLineupFlags('V', 'Valves')).toEqual({ lineup_candidate: true, critical_valve: false })
  })
})
