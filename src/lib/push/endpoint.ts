/**
 * A-23 (S02): el servidor hace POST al `endpoint` de cada suscripción push, así que solo se aceptan
 * los servicios push reales de los navegadores (https). Otro host convertiría el Worker en un relé.
 */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,               // Chrome, Edge (Android), Brave, Opera
  /^android\.googleapis\.com$/,           // Chrome antiguo (GCM)
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^(.+\.)?push\.apple\.com$/,            // Safari / iOS (web.push.apple.com)
  /^(.+\.)?notify\.windows\.com$/,        // Edge en Windows (WNS)
]

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let u: URL
  try { u = new URL(endpoint) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
  return PUSH_HOSTS.some(re => re.test(u.hostname.toLowerCase()))
}
