/**
 * A-18 (S02): destino de redirección seguro tras un enlace de email (`?next=`).
 * Solo rutas relativas del propio sitio: `/algo`. Rechaza `//host`, `/\host` (los navegadores
 * normalizan `\` a `/`), esquemas (`https:`, `javascript:`) y caracteres de control.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || next.length > 512) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback
  return next
}
