import Anthropic from '@anthropic-ai/sdk'

// ── Cliente Claude (server-only) ─────────────────────────────────────────────
// La clave vive en ANTHROPIC_API_KEY (secreto de Wrangler en Cloudflare,
// .env.local en desarrollo). Sin clave, las funciones de IA devuelven un error
// claro en vez de fallar a mitad de camino.

export const CLAUDE_MODEL = 'claude-opus-5'

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export const AI_NOT_CONFIGURED =
  'La IA no está configurada en este entorno (falta ANTHROPIC_API_KEY). Pídele al administrador de la plataforma que la active.'

export function createClaudeClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 2,
    timeout: 10 * 60 * 1000, // ms — la generación de matriz puede tardar minutos
  })
}
