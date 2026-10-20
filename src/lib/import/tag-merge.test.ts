import { describe, expect, it } from 'vitest'
import { payloadColumns, planTag, presentFromColumns, type ExistingTag } from './tag-merge'

const resolved = { projectId: 'P', subsystemId: 'SS-NEW', disciplineId: 'D', equipmentTypeId: 'EQ-DETECTED' }
const existing: ExistingTag = {
  id: 't1', subsystem_id: 'SS-OLD', discipline_id: 'D', has_work: false, description: 'Transmisor de presión',
  manufacturer: 'Rosemount', model: '3051', serial_number: 'S-1', preservation_required: true, pid_drawing: 'PID-001',
  fluid_type: 'Gas', mounting_typical: 'T-1', range_min: 0, range_max: 100, equipment_type_id: 'EQ-PT', criticality: 'safety',
}

describe('reimportar tags sin perder datos (S07, D9)', () => {
  it('un Excel con solo TAG + SUBSISTEMA no toca fabricante, preservación, descripción ni tipo', () => {
    const present = presentFromColumns(['tag', 'subsystem_code'])
    const plan = planTag({ tag_number: 'PT-101' }, present, existing, resolved)
    expect(plan.payload).toMatchObject({
      description: 'Transmisor de presión', equipment_type_id: 'EQ-PT', subsystem_id: 'SS-NEW',
    })
    expect(plan.payload).not.toHaveProperty('manufacturer')
    expect(plan.payload).not.toHaveProperty('preservation_required')
    expect(plan.changes).toEqual(['subsystem_id'])
  })

  it('una celda vacía en una columna presente tampoco borra el dato', () => {
    const present = presentFromColumns(['tag', 'manufacturer', 'model'])
    const plan = planTag({ tag_number: 'PT-101', manufacturer: '', model: '3051S' }, present, existing, resolved)
    expect(plan.payload).toMatchObject({ manufacturer: 'Rosemount', model: '3051S' })
    expect(plan.changes).toEqual(['model'])
  })

  it('las claves son iguales para nuevos y existentes (el upsert por lotes no rellena con NULL)', () => {
    const present = presentFromColumns(['tag', 'manufacturer', 'range_min', 'preservation'])
    const a = planTag({ tag_number: 'PT-101', range_min: 5 }, present, existing, resolved)
    const b = planTag({ tag_number: 'PT-999', manufacturer: 'Yokogawa' }, present, null, resolved)
    expect(Object.keys(a.payload).sort()).toEqual(Object.keys(b.payload).sort())
    expect(b.payload).toMatchObject({ description: 'PT-999', manufacturer: 'Yokogawa', range_min: null, preservation_required: false, equipment_type_id: 'EQ-DETECTED', subsystem_id: 'SS-NEW' })
    expect(payloadColumns(present)).toEqual(['description', 'manufacturer', 'preservation_required', 'range_min', 'equipment_type_id'])
  })

  it('no mueve de subsistema un tag con ITR o punch; sin trabajo sí lo mueve', () => {
    const present = presentFromColumns(['tag', 'subsystem_code'])
    const blocked = planTag({ tag_number: 'PT-101' }, present, { ...existing, has_work: true }, resolved)
    expect(blocked.move).toEqual({ from: 'SS-OLD', to: 'SS-NEW', blocked: true })
    expect(blocked.payload.subsystem_id).toBe('SS-OLD')
    expect(blocked.changes).not.toContain('subsystem_id')
    const sinColumna = planTag({ tag_number: 'PT-101' }, presentFromColumns(['tag']), existing, resolved)
    expect(sinColumna.move).toBeNull()
    expect(sinColumna.payload.subsystem_id).toBe('SS-OLD')
  })

  it('el SIL sugiere «safety» solo en tags nuevos; el tipo de equipo cambia solo con su columna', () => {
    const present = presentFromColumns(['tag', 'sil'])
    expect(planTag({ tag_number: 'X-1', sil_level: 'SIL2' }, present, null, resolved).payload.criticality).toBe('safety')
    expect(planTag({ tag_number: 'PT-101', sil_level: 'SIL2' }, present, { ...existing, criticality: 'normal' }, resolved).payload.criticality).toBe('normal')
    const withType = planTag({ tag_number: 'PT-101' }, presentFromColumns(['tag', 'equipment_type']), existing, resolved)
    expect(withType.payload.equipment_type_id).toBe('EQ-DETECTED')
    expect(withType.changes).toContain('equipment_type_id')
  })
})
