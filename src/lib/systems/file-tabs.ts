/**
 * N2a (decisiones de Luis 2026-10-21, «Maquetas N2»): ficha de sistema única en /projects/[id]/systems/[systemId],
 * con pestañas en la URL (`?tab=`) en vez de las dos fichas de antes (Control Tower y Sistemas).
 * Por defecto Gates; `?gate=<id>` (desde un badge de la matriz) abre esa pestaña con el gate a la vista.
 * P3: «Planos» (8.ª) = hojas P&ID del sistema, cobertura de pines y estado de sus límites.
 */
export const SYSTEM_TABS = ['gates', 'plan', 'deps', 'startup', 'transfer', 'vendors', 'data', 'drawings'] as const
export type SystemTab = (typeof SYSTEM_TABS)[number]

export function parseSystemTab(sp: { tab?: string | string[]; gate?: string | string[] }): SystemTab {
  const v = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
  if (v && (SYSTEM_TABS as readonly string[]).includes(v)) return v as SystemTab
  return 'gates'
}

export function systemTabHref(projectId: string, systemId: string, tab: SystemTab): string {
  return `/projects/${projectId}/systems/${systemId}${tab === 'gates' ? '' : `?tab=${tab}`}`
}
