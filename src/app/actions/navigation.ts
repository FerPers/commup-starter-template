'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { EVENT_PHASE, pickActivePhase, type Phase } from '@/lib/navigation/menu'

/** Ventana de «actividad reciente» para elegir la fase abierta del menú. */
const ACTIVITY_DAYS = 14

/**
 * N1: fase del proyecto con más actividad reciente (la abierta por defecto en el menú por fases de owner/admin).
 * Cuenta eventos del bus (`domain_events`, índice por proyecto y fecha) más las tablas de arranque y gestión, que no
 * emiten eventos. Solo conteos `head` (sin filas); el menú lo pide una vez por proyecto y sesión.
 */
export const getActivePhase = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string }): Promise<{ phase: Phase }> => {
    const db = ctx.supabase
    const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000).toISOString()
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
    const byTypes = (types: string[]) => db.from('domain_events').select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId).gte('occurred_at', since).in('aggregate_type', types)
    const typesOf = (phase: Phase) => Object.entries(EVENT_PHASE).filter(([, p]) => p === phase).map(([t]) => t)
    const recent = (table: 'procedure_run_steps' | 'lineup_items' | 'startup_events' | 'performance_runs' | 'actions' | 'project_constraints' | 'daily_reports' | 'technical_queries' | 'pssr_reviews', column: string) =>
      db.from(table).select('project_id', { count: 'exact', head: true }).eq('project_id', input.projectId).gte(column, since)

    const [prep, mc, com, pssr, runs, lineups, events, perf, actions, constraints, reports, tqs] = await Promise.all([
      count(byTypes(typesOf('prep'))), count(byTypes(typesOf('mc'))), count(byTypes(typesOf('com'))),
      count(recent('pssr_reviews', 'updated_at')),
      count(recent('procedure_run_steps', 'done_at')), count(recent('lineup_items', 'set_at')),
      count(recent('startup_events', 'recorded_at')), count(recent('performance_runs', 'updated_at')),
      count(recent('actions', 'updated_at')), count(recent('project_constraints', 'updated_at')),
      count(recent('daily_reports', 'created_at')), count(recent('technical_queries', 'updated_at')),
    ])
    const su = runs + lineups + events + perf + (await count(byTypes(typesOf('su'))))
    return { phase: pickActivePhase({ prep, mc, com: com + pssr, su, mgmt: actions + constraints + reports + tqs }) }
  },
)
