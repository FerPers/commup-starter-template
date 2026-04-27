import type { OrgMemberRole } from './database'

export type WidgetId =
  | 'inspector_summary'
  | 'my_itrs'
  | 'my_punches'
  | 'client_summary'
  | 'client_signatures'
  | 'client_projects'
  | 'cat_a_alerts'
  | 'kpi_summary'
  | 'projects_active'
  | 'disciplines'

export interface WidgetConfig {
  id: WidgetId
  hidden: boolean
}

export interface DashboardLayout {
  widgets: WidgetConfig[]
}

export interface WidgetMeta {
  id: WidgetId
  titleKey: string
  descKey: string
  allowedRoles: OrgMemberRole[]
}
