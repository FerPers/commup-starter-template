import { describe, expect, it } from 'vitest'
import { DEFAULT_ITEM, normalizeItemType } from './template-builder-shared'

describe('continuity template type', () => {
  it('clears generic measurement requirement when changing to continuity', () => {
    expect(normalizeItemType({ ...DEFAULT_ITEM, requires_measurement: true }, 'continuity').requires_measurement).toBe(false)
  })
  it('preserves measurement requirement for other types', () => {
    expect(normalizeItemType({ ...DEFAULT_ITEM, requires_measurement: true }, 'measurement').requires_measurement).toBe(true)
  })
})
