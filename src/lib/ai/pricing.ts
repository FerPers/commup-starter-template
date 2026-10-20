// S15 (I-19): modelo por tarea y precios para estimar el coste (USD por millón de tokens, tarifas de la API de
// Anthropic; escritura de caché = 1,25 × entrada). Decisión de Luis (2026-10-20): Opus solo donde la calidad del
// razonamiento lo justifica (matriz ITR e importación C&E); Sonnet para redactar y traducir.

export const AI_FEATURES = ['itr_matrix', 'ce_import', 'daily_report', 'itr_translations', 'systems'] as const
export type AiFeature = (typeof AI_FEATURES)[number]

export const AI_MODELS: Record<AiFeature, string> = {
  itr_matrix: 'claude-opus-5-5',
  ce_import: 'claude-opus-5-5',
  daily_report: 'claude-sonnet-5-5',
  itr_translations: 'claude-sonnet-5-5',
  systems: 'claude-sonnet-5-5',
}

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }
export const AI_PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

type UsageLike = {
  input_tokens: number; output_tokens: number
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null
}

/** Coste estimado de una respuesta; un modelo sin precio conocido se cobra como Opus (cota alta). */
export function aiCostUsd(model: string, u: UsageLike): number {
  const p = AI_PRICES[model] ?? AI_PRICES[Object.keys(AI_PRICES).find(k => model.startsWith(k)) ?? 'claude-opus-5-5']
  const cost = (u.input_tokens * p.input + u.output_tokens * p.output
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000
  return Math.round(cost * 1e6) / 1e6
}

/** Tope diario por org (= SQL org_ai_budget): organizations.settings.ai.daily_budget_usd, por defecto 20. */
export function aiBudget(settings: unknown): number {
  const v = Number((settings as { ai?: { daily_budget_usd?: unknown } } | null)?.ai?.daily_budget_usd)
  return Number.isFinite(v) && v >= 0 ? v : 20
}
