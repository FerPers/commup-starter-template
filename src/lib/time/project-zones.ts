import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TIMEZONE, todayIn } from './zone'

/**
 * S10 (D-05/G-13): zona horaria de varios proyectos de una vez (crons y pantallas de varios proyectos).
 * `.in()` en lotes de 200 ids para no superar el largo de URL de PostgREST.
 */
export async function loadProjectTimezones(db: SupabaseClient, projectIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = Array.from(new Set(projectIds))
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('projects').select('id, timezone').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const p of data ?? []) out.set(p.id as string, (p.timezone as string | null) ?? DEFAULT_TIMEZONE)
  }
  return out
}

/** «Hoy» de cada proyecto según su zona (los ausentes del mapa usan la zona por defecto). */
export function projectTodayFn(zones: Map<string, string>, now: Date = new Date()): (projectId: string) => string {
  const cache = new Map<string, string>()
  return projectId => {
    const tz = zones.get(projectId) ?? DEFAULT_TIMEZONE
    if (!cache.has(tz)) cache.set(tz, todayIn(tz, now))
    return cache.get(tz)!
  }
}

/** «Hoy» de un proyecto (una lectura). */
export async function getProjectToday(db: SupabaseClient, projectId: string): Promise<{ today: string; timezone: string }> {
  const { data } = await db.from('projects').select('timezone').eq('id', projectId).maybeSingle()
  const timezone = (data?.timezone as string | null) ?? DEFAULT_TIMEZONE
  return { today: todayIn(timezone), timezone }
}
