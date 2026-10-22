/** Origen público para los enlaces que salen de la app (verificación del handover, QR de los PDF). */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') ?? 'https://commup.app'
}
