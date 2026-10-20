/**
 * Zona horaria del proyecto (S10 — D-05/E-15/G-13/B-29, decisión D12 del 2026-10-20).
 *
 * `projects.timezone` (IANA, por defecto America/Bogota) define «hoy» y el corte del día. El servidor (Worker)
 * corre en UTC: `new Date().toISOString().slice(0, 10)` da el día siguiente desde las 19:00 en Colombia.
 * En SQL el equivalente es `project_today(project_id)` / `tz_today(tz)` (migración 20261105120000).
 * Lógica pura; tests en zone.test.ts.
 */

export const DEFAULT_TIMEZONE = 'America/Bogota'

/** Zonas ofrecidas en la configuración del proyecto (cualquier IANA válida se acepta por BD). */
export const TIMEZONE_OPTIONS = [
  'America/Bogota', 'America/Caracas', 'America/Lima', 'America/Guayaquil', 'America/Panama', 'America/Mexico_City',
  'America/Houston', 'America/Chicago', 'America/New_York', 'America/Santiago', 'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo', 'America/Port_of_Spain', 'Atlantic/Azores', 'UTC', 'Europe/London', 'Europe/Madrid',
  'Africa/Lagos', 'Africa/Luanda', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kolkata', 'Asia/Singapore',
  'Australia/Perth',
] as const

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const safeZone = (tz: string | null | undefined) => (isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE)

/** Fecha (YYYY-MM-DD) de `now` en la zona `tz`. */
export function todayIn(tz: string | null | undefined, now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeZone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Suma días a una fecha ISO (YYYY-MM-DD), sin pasar por la zona del servidor. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Días entre dos fechas ISO (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * La fecha local más adelantada posible (UTC+14): sirve de cota para filtrar en la BD antes de aplicar
 * la zona de cada proyecto («vencido» = fecha < hoy del proyecto ≤ esta cota).
 */
export function latestPossibleToday(now: Date = new Date()): string {
  return todayIn('Pacific/Kiritimati', now)
}

/** Hora local HH:MM de un instante ISO en la zona. */
export function timeIn(iso: string, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(tz), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** Fecha y hora local «YYYY-MM-DD HH:MM» de un instante ISO en la zona. */
export function dateTimeIn(iso: string, tz: string | null | undefined): string {
  return `${todayIn(tz, new Date(iso))} ${timeIn(iso, tz)}`
}

/** Abreviatura de la zona para mostrar junto a una hora («GMT-5», «UTC»…). */
export function zoneLabel(tz: string | null | undefined, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(tz), timeZoneName: 'shortOffset' })
    .formatToParts(at).find(p => p.type === 'timeZoneName')
  return part?.value ?? safeZone(tz)
}

/**
 * Fecha y hora de un instante en la zona del proyecto, con la zona explícita («19 oct 2026, 20:30 GMT-5»).
 * Con zona y locale fijos el texto es el mismo en el servidor (UTC) y en el navegador: no hace falta
 * suppressHydrationWarning.
 */
export function formatInZone(iso: string, tz: string | null | undefined, locale: string, withTime = true): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', {
    timeZone: safeZone(tz), year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' } : {}),
  }).format(new Date(iso))
}

/** Fecha de hoy (YYYY-MM-DD) en la zona del navegador. Solo en componentes cliente (en el servidor sería UTC). */
export function browserToday(now: Date = new Date()): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, now)
}
