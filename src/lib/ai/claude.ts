import Anthropic from '@anthropic-ai/sdk'
import { getTranslations } from 'next-intl/server'

// ── Cliente Claude (server-only) ─────────────────────────────────────────────
// La clave vive en ANTHROPIC_API_KEY (secreto de Wrangler en Cloudflare,
// .env.local en desarrollo). Sin clave, las funciones de IA devuelven un error
// claro en vez de fallar a mitad de camino.

// S15: el modelo lo elige cada tarea (AI_MODELS en ./pricing.ts) y toda llamada pasa por runAi (./run.ts).

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/** V3: texto en el idioma de quien llama (`ActionErrors.ai.notConfigured`). */
export async function aiNotConfigured(): Promise<string> {
  const t = await getTranslations('ActionErrors')
  return t('ai.notConfigured')
}

export function createClaudeClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 2,
    timeout: 10 * 60 * 1000, // ms — la generación de matriz puede tardar minutos
  })
}
