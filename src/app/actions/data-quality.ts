'use server'

import { getActiveMembership as getOrgCtx } from '@/lib/supabase/membership'

export type DQSeverity = 'critical' | 'error' | 'warning'

export type DQIssue = {
  severity: DQSeverity
  category: string
  entity_type: string
  entity_id: string
  entity_label: string
  project_id: string
  description: string
  suggested_fix: string
  fix_url: string
}

export type DQSummaryRow = {
  severity: DQSeverity
  category: string
  count: number
}

export async function getDataQualitySummary(): Promise<
  { error?: string; summary?: DQSummaryRow[] }
> {
  const ctx = await getOrgCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data, error } = await ctx.supabase.rpc('data_quality_summary', {
    p_org_id: ctx.orgId,
  })
  if (error) return { error: error.message }
  return { summary: (data ?? []) as DQSummaryRow[] }
}

export async function listDataQualityIssues(params: {
  category?: string
  severity?: DQSeverity
  projectId?: string
  limit?: number
  offset?: number
}): Promise<{ error?: string; issues?: DQIssue[] }> {
  const ctx = await getOrgCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data, error } = await ctx.supabase.rpc('data_quality_list', {
    p_org_id: ctx.orgId,
    p_category: params.category ?? null,
    p_severity: params.severity ?? null,
    p_project_id: params.projectId ?? null,
    p_limit: params.limit ?? 200,
    p_offset: params.offset ?? 0,
  })
  if (error) return { error: error.message }
  return { issues: (data ?? []) as DQIssue[] }
}

export type ProjectForecast = {
  project_id: string
  total_itrs: number
  itrs_approved: number
  itrs_remaining: number
  velocity_per_day: number
  days_to_complete_p50: number | null
  eta_p50: string | null
  confidence: 'low' | 'medium' | 'high'
  punch_a_open: number
  blockers: number
}

export async function getProjectForecast(
  projectId: string,
): Promise<{ error?: string; forecast?: ProjectForecast }> {
  const ctx = await getOrgCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { data, error } = await ctx.supabase.rpc('analytics_project_forecast', {
    p_project_id: projectId,
  })
  if (error) return { error: error.message }
  const rows = (data ?? []) as ProjectForecast[]
  return { forecast: rows[0] }
}

export type Bottleneck = {
  subsystem_id: string
  project_id: string
  subsystem_code: string
  subsystem_name: string
  system_id: string
  system_name: string
  itrs_remaining: number
  punch_a_open: number
  punch_b_open: number
  punch_c_open: number
  recent_rejects: number
  total_itrs: number
  itrs_approved: number
  bottleneck_score: number
  reasons: string[]
}

export async function listBottlenecks(params: {
  projectId?: string
  minScore?: number
  limit?: number
}): Promise<{ error?: string; bottlenecks?: Bottleneck[] }> {
  const ctx = await getOrgCtx()
  if (!ctx) return { error: 'No autenticado' }

  let q = ctx.supabase
    .from('analytics_bottlenecks')
    .select(
      'subsystem_id, project_id, subsystem_code, subsystem_name, system_id, system_name, itrs_remaining, punch_a_open, punch_b_open, punch_c_open, recent_rejects, total_itrs, itrs_approved, bottleneck_score, reasons',
    )
    .eq('org_id', ctx.orgId)
    .gte('bottleneck_score', params.minScore ?? 1)
    .order('bottleneck_score', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.projectId) q = q.eq('project_id', params.projectId)

  const { data, error } = await q
  if (error) return { error: error.message }
  return { bottlenecks: (data ?? []) as Bottleneck[] }
}
