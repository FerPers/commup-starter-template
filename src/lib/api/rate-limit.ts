// S15 (A-13): límite de peticiones de la API v1 con el binding de Cloudflare Workers Rate Limiting
// (wrangler.jsonc → ratelimits.API_RATE_LIMITER, 600/min). En desarrollo local (sin binding) no limita.
// Clave: `key:<api_key_id>` para claves válidas e `ip:<ip>` para intentos con clave inválida (fuerza bruta).

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> }

async function limiter(): Promise<RateLimiter | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const env = getCloudflareContext().env as unknown as { API_RATE_LIMITER?: RateLimiter }
    return env.API_RATE_LIMITER ?? null
  } catch {
    return null
  }
}

/** true = se pasó del límite (responder 429). Si el limitador falla, deja pasar: la API no se cae por él. */
export async function isRateLimited(key: string): Promise<boolean> {
  const rl = await limiter()
  if (!rl) return false
  try {
    const { success } = await rl.limit({ key })
    return !success
  } catch {
    return false
  }
}
