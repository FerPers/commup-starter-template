import type { OrgMemberRole } from '@/types/database'
import type { DashboardLayout, WidgetId, WidgetMeta } from '@/types/dashboard'

export const WIDGET_REGISTRY: Record<WidgetId, WidgetMeta> = {
  inspector_summary: {
    id: 'inspector_summary',
    titleKey: 'widgets.inspectorSummary.title',
    descKey: 'widgets.inspectorSummary.desc',
    allowedRoles: ['inspector'],
  },
  my_itrs: {
    id: 'my_itrs',
    titleKey: 'widgets.myItrs.title',
    descKey: 'widgets.myItrs.desc',
    allowedRoles: ['inspector'],
  },
  my_punches: {
    id: 'my_punches',
    titleKey: 'widgets.myPunches.title',
    descKey: 'widgets.myPunches.desc',
    allowedRoles: ['inspector'],
  },
  client_summary: {
    id: 'client_summary',
    titleKey: 'widgets.clientSummary.title',
    descKey: 'widgets.clientSummary.desc',
    allowedRoles: ['client'],
  },
  client_signatures: {
    id: 'client_signatures',
    titleKey: 'widgets.clientSignatures.title',
    descKey: 'widgets.clientSignatures.desc',
    allowedRoles: ['client'],
  },
  client_projects: {
    id: 'client_projects',
    titleKey: 'widgets.clientProjects.title',
    descKey: 'widgets.clientProjects.desc',
    allowedRoles: ['client'],
  },
  cat_a_alerts: {
    id: 'cat_a_alerts',
    titleKey: 'widgets.catAAlerts.title',
    descKey: 'widgets.catAAlerts.desc',
    allowedRoles: ['architect', 'leader'],
  },
  kpi_summary: {
    id: 'kpi_summary',
    titleKey: 'widgets.kpiSummary.title',
    descKey: 'widgets.kpiSummary.desc',
    allowedRoles: ['owner', 'admin', 'architect', 'leader'],
  },
  projects_active: {
    id: 'projects_active',
    titleKey: 'widgets.projectsActive.title',
    descKey: 'widgets.projectsActive.desc',
    allowedRoles: ['owner', 'admin', 'architect', 'leader'],
  },
  disciplines: {
    id: 'disciplines',
    titleKey: 'widgets.disciplines.title',
    descKey: 'widgets.disciplines.desc',
    allowedRoles: ['owner', 'admin', 'architect', 'leader'],
  },
}

export const DEFAULT_LAYOUTS: Record<OrgMemberRole, WidgetId[]> = {
  inspector: ['inspector_summary', 'my_itrs', 'my_punches'],
  client: ['client_summary', 'client_signatures', 'client_projects'],
  architect: ['cat_a_alerts', 'kpi_summary', 'projects_active', 'disciplines'],
  leader: ['cat_a_alerts', 'kpi_summary', 'projects_active', 'disciplines'],
  owner: ['kpi_summary', 'projects_active', 'disciplines'],
  admin: ['kpi_summary', 'projects_active', 'disciplines'],
}

export function widgetsForRole(role: OrgMemberRole): WidgetMeta[] {
  return Object.values(WIDGET_REGISTRY).filter(w => w.allowedRoles.includes(role))
}

/**
 * Resolves the effective layout for a role given the stored layout.
 * - Filters out widgets not allowed for this role (e.g. role changed).
 * - Appends any default widgets missing from stored (so new widgets surface automatically).
 * - Stored ordering is preserved.
 */
export function resolveLayout(role: OrgMemberRole, stored: DashboardLayout | null | undefined): DashboardLayout {
  const allowedIds = new Set(widgetsForRole(role).map(w => w.id))
  const defaults = DEFAULT_LAYOUTS[role]

  if (!stored || !Array.isArray(stored.widgets)) {
    return { widgets: defaults.map(id => ({ id, hidden: false })) }
  }

  const seen = new Set<WidgetId>()
  const valid = stored.widgets.filter(w => {
    if (!allowedIds.has(w.id)) return false
    if (seen.has(w.id)) return false
    seen.add(w.id)
    return true
  }).map(w => ({ id: w.id, hidden: !!w.hidden }))

  const missing = defaults
    .filter(id => !seen.has(id))
    .map(id => ({ id, hidden: false }))

  return { widgets: [...valid, ...missing] }
}
