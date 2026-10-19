import { describe, expect, it } from 'vitest'
import { VENDOR_CHECKLIST, canImplement, missingItems, resultNeedsFindings } from './catalog'

describe('vendors catalog', () => {
  it('checklists = SQL vendor_checklist_keys', () => {
    expect(VENDOR_CHECKLIST.mobilization).toEqual(['scope_interfaces', 'hse_induction', 'permits', 'calibrated_equipment', 'documents_current'])
    expect(VENDOR_CHECKLIST.demobilization).toEqual(['as_built_delivered', 'tools_removed', 'permits_closed', 'area_clean'])
  })

  it('lista lo que falta en orden', () => {
    expect(missingItems('demobilization', new Set(['tools_removed']))).toEqual(['as_built_delivered', 'permits_closed', 'area_clean'])
    expect(missingItems('mobilization', new Set(VENDOR_CHECKLIST.mobilization))).toEqual([])
  })

  it('resultado con hallazgos exige hallazgos', () => {
    expect(resultNeedsFindings('passed')).toBe(false)
    expect(resultNeedsFindings('passed_with_findings')).toBe(true)
    expect(resultNeedsFindings('failed')).toBe(true)
  })

  it('implementar exige MOC cuando la recomendación lo requiere', () => {
    expect(canImplement({ status: 'approved', requires_moc: true }, '')).toBe(false)
    expect(canImplement({ status: 'approved', requires_moc: true }, 'MOC-1')).toBe(true)
    expect(canImplement({ status: 'approved', requires_moc: false }, '')).toBe(true)
    expect(canImplement({ status: 'proposed', requires_moc: false }, 'MOC-1')).toBe(false)
  })
})
