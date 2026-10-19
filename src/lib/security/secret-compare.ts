/**
 * A-27 (S02): compara secretos en tiempo constante (no corta en el primer byte distinto).
 * Sin dependencias de Node: corre igual en Workers.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** `Authorization: Bearer <secret>` de los /api/cron/*. */
export function hasBearerSecret(authorization: string | null, secret: string): boolean {
  return timingSafeEqualStr(authorization ?? '', `Bearer ${secret}`)
}
