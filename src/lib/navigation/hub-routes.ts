// H-18: pestañas por RUTA de los hubs Gestión diaria y Arranque (como Planificación y Señales y lazos en N2c).
// La primera pestaña es la raíz del hub; las demás, una subruta. Los `?tab=` viejos (avisos, enlaces guardados,
// Mi trabajo de versiones anteriores) redirigen con `legacyTab`.

export const DAILY_TABS = ['actions', 'constraints', 'tqs', 'decisions', 'reports', 'handovers'] as const
export type DailyHubTab = (typeof DAILY_TABS)[number]

export const STARTUP_TABS = ['procedures', 'lineups', 'events', 'operations', 'performance'] as const
export type StartupHubTab = (typeof STARTUP_TABS)[number]

export const dailyTabHref = (projectId: string, tab: DailyHubTab) =>
  `/projects/${projectId}/daily${tab === 'actions' ? '' : `/${tab}`}`

export const startupTabHref = (projectId: string, tab: StartupHubTab) =>
  `/projects/${projectId}/startup${tab === 'procedures' ? '' : `/${tab}`}`

/** Pestaña a la que redirigir un `?tab=` viejo; null si no hay que moverse (sin tab, desconocida o la raíz). */
export function legacyTab<T extends string>(tabs: readonly T[], tab: string | undefined): T | null {
  if (!tab || tab === tabs[0] || !tabs.includes(tab as T)) return null
  return tab as T
}

/** Pestaña de la lista de Gestión diaria para un tipo de ítem (action → actions, tq → tqs…). */
export const dailyTabForKind = (kind: 'action' | 'constraint' | 'tq' | 'decision'): DailyHubTab => `${kind}s` as DailyHubTab
