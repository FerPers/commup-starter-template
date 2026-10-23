import { describe, expect, it } from 'vitest'
import { MAX_ADJUSTS_PER_SIGNATURE, buildAdjustPrompt, catalogPrompt, estimateAdjustUsd, reconcileAdjust, type AiSignature } from './ai-adjust'

const sig = (over: Partial<AiSignature> = {}): AiSignature => ({
  equipment_type_id: 't-xv', type_code: 'XV', type_name: 'Válvula de Bloqueo / ESD', prefix: 'XV', discipline_id: 'd1',
  discipline_code: 'INST', discipline_name: 'Instruments', desc_norm: 'valvula on off', description: 'Válvula On/Off', n: 18,
  samples: ['XV-101', 'XV-102', 'XV-103', 'XV-104'], sil_level: 'SIL 2', fluid_type: 'Gas', signal_type: null,
  base: ['I05A', 'I08A', 'I11A', 'I11B'], review_state: 'pending', proposals: [], open: 0, ...over,
})
const candidates = new Set(['I05A', 'I08A', 'I11A', 'I11B', 'I27B', 'I42B', 'E13A'])
const a = (code: string, reason = 'Motivo verificable de prueba', confidence = 0.8) => ({ code, reason, confidence })

describe('R4: conciliación de los ajustes', () => {
  it('agregar solo candidatas fuera de la base; excluir solo de la base', () => {
    const r = reconcileAdjust({ items: [{ i: 0, add: [a('i27b', 'Válvula con señal discreta al DCS', 1.3), a('I05A'), a('ZZ99')], exclude: [a('I08A'), a('I42B')] }] }, [sig()], candidates)
    expect(r.get(0)).toEqual([
      { code: 'I27B', action: 'add', confidence: 1, reason: 'Válvula con señal discreta al DCS' },
      { code: 'I08A', action: 'exclude', confidence: 0.8, reason: 'Motivo verificable de prueba' },
    ])
  })

  it('no repite lo rechazado, pide motivo y respeta el tope', () => {
    const g = sig({ proposals: [{ id: 'p', code: 'I27B', action: 'add', confidence: 0.5, reason: 'x', status: 'rejected', applied_tags: null, skipped_tags: null }] })
    const many = ['E13A', 'I42B', 'I27B'].map(c => a(c))
    const r = reconcileAdjust({ items: [{ i: 0, add: [...many, a('I05A', 'corto')], exclude: ['I05A', 'I08A', 'I11A', 'I11B'].map(c => a(c)) }] }, [g], candidates)
    const list = r.get(0)!
    expect(list.some(p => p.code === 'I27B')).toBe(false)
    expect(list).toHaveLength(MAX_ADJUSTS_PER_SIGNATURE)
  })

  it('índices fuera de rango o repetidos se descartan; un grupo sin ajustes queda vacío', () => {
    const r = reconcileAdjust({ items: [{ i: 0, add: [], exclude: [] }, { i: 0, add: [a('I27B')], exclude: [] }, { i: 4, add: [a('I27B')], exclude: [] }] }, [sig()], candidates)
    expect(r.size).toBe(1)
    expect(r.get(0)).toEqual([])
  })
})

describe('R4: prompt y costo', () => {
  it('cada firma lleva base, atributos y lo rechazado', () => {
    const p = buildAdjustPrompt([sig({ proposals: [{ id: 'p', code: 'I08A', action: 'exclude', confidence: 1, reason: 'x', status: 'rejected', applied_tags: null, skipped_tags: null }] })])
    expect(p).toContain('#0 tipo XV (Válvula de Bloqueo / ESD)')
    expect(p).toContain('base: I05A, I08A, I11A, I11B')
    expect(p).toContain('SIL SIL 2, fluido Gas')
    expect(p).toContain('Rechazado: −I08A')
    expect(catalogPrompt([{ code: 'I27B', title: 'Digital  I/O check', discipline: 'INST', phase: 'B' }])).toBe('I27B | Digital I/O check | disciplina INST | fase B')
  })

  it('costo: centavos por decenas de firmas, dólares por miles', () => {
    expect(estimateAdjustUsd(0, 30_000)).toBe(0)
    expect(estimateAdjustUsd(20, 30_000)).toBeLessThan(0.5)
    expect(estimateAdjustUsd(1000, 30_000)).toBeGreaterThan(5)
  })
})
