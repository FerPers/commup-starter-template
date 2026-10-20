import { describe, expect, it } from 'vitest'
import { AI_FEATURES, AI_MODELS, aiBudget, aiCostUsd } from './pricing'

describe('IA: modelo por tarea y coste (S15)', () => {
  it('Opus solo para matriz ITR e importación C&E', () => {
    expect(AI_FEATURES.filter(f => AI_MODELS[f] === 'claude-opus-5-5')).toEqual(['itr_matrix', 'ce_import'])
  })

  it('coste por tokens, incluida la caché', () => {
    expect(aiCostUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBe(6)
    expect(aiCostUsd('claude-sonnet-5-5', { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 50_000 })).toBe(0.05)
    // Modelo desconocido: cota alta (precio de Opus)
    expect(aiCostUsd('modelo-x', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4)
  })

  it('tope diario por defecto 20 USD', () => {
    expect(aiBudget(null)).toBe(20)
    expect(aiBudget({ ai: { daily_budget_usd: 50 } })).toBe(50)
    expect(aiBudget({ ai: { daily_budget_usd: 'x' } })).toBe(20)
  })
})
