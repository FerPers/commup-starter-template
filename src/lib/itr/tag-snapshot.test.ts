import { describe, expect, it } from 'vitest'
import { resolveTagData } from './tag-snapshot'

// A44 (parte): lo firmado no cambia aunque cambie el tag; la diferencia se ve.
const live = { tag_number: 'PT-101', description: 'Transmisor', manufacturer: 'Rosemount', serial_number: 'B-222', range_min: 0, range_max: 25, eng_unit: 'bar' }

describe('resolveTagData', () => {
  it('sin firmar muestra el tag en vivo', () => {
    expect(resolveTagData(live, { serial_number: 'A-111' }, false)).toEqual({ data: live, frozen: false, changed: {} })
  })
  it('firmado antes de A44 (sin foto) sigue en vivo', () => {
    expect(resolveTagData(live, null, true)).toMatchObject({ data: live, frozen: false })
  })
  it('firmado muestra la foto y marca lo que cambió después', () => {
    const snapshot = { ...live, serial_number: 'A-111', range_max: 20, model: null }
    const r = resolveTagData(live, snapshot, true)
    expect(r.frozen).toBe(true)
    expect(r.data).toMatchObject({ serial_number: 'A-111', range_max: 20, manufacturer: 'Rosemount' })
    expect(r.changed).toEqual({ serial_number: 'B-222', range_max: 25 })
  })
  it('vacío y null cuentan igual (no es un cambio)', () => {
    expect(resolveTagData({ ...live, model: '' }, { ...live, model: null }, true).changed).toEqual({})
  })
})
