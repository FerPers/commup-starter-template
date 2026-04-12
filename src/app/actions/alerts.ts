'use server'

import { createClient } from '@/lib/supabase/server'

// ── Types ──────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type ProjectAlert = {
  type:
    | 'behind_schedule'
    | 'high_cat_a'
    | 'overdue_preservation'
    | 'overdue_work_plans'
  severity: AlertSeverity
  /** Numeric value shown in the alert message (lag %, punch count, plan count…) */
  value: number
}

// ── Thresholds ─────────────────────────────────────────────────────────────
const BEHIND_SCHEDULE_GAP = 10  // % points behind plan → alert
const HIGH_CAT_A_THRESHOLD = 5  // open Cat A punches → alert

// ── Helper ─────────────────────────────────────────────────────────────────

/** Linear planned % for today, same formula as the S-curve in KpiDashboard */
function plannedPctForToday(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null
  const start = new Date(startDate).getTime()
  const end   = new Date(endDate).getTime()
  const now   = Date.now()
  if (end <= start) return null
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
}

// ── getProjectAlerts ────────────────────────────────────────────────────────

export async function getProjectAlerts(projectId: string): Promise<ProjectAlert[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: project },
    { data: latestSnapshot },
    { count: catACount },
    { count: overduePresCount },
    { count: overdueWpCount },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('start_date, end_date')
      .eq('id', projectId)
      .maybeSingle(),

    supabase
      .from('kpi_snapshots')
      .select('completion_pct, snapshot_date')
      .eq('project_id', projectId)
      .is('phase_id', null)
      .is('subsystem_id', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('punches')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('category', 'A')
      .not('status', 'in', '(closed,cancelled)'),

    supabase
      .from('preservation_plans')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'active')
      .lt('next_due_date', today),

    supabase
      .from('work_plans')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .lt('plan_date', today)
      .not('status', 'eq', 'completed'),
  ])

  const alerts: ProjectAlert[] = []

  // ── 1. Behind schedule ──────────────────────────────────────────────────
  if (project && latestSnapshot) {
    const planned = plannedPctForToday(
      project.start_date as string | null,
      project.end_date as string | null,
    )
    if (planned !== null) {
      const actual = Number(latestSnapshot.completion_pct)
      const lag = planned - actual
      if (lag >= BEHIND_SCHEDULE_GAP) {
        alerts.push({
          type: 'behind_schedule',
          severity: lag >= 20 ? 'critical' : 'warning',
          value: Math.round(lag),
        })
      }
    }
  }

  // ── 2. High Cat A punches ───────────────────────────────────────────────
  const catA = catACount ?? 0
  if (catA >= HIGH_CAT_A_THRESHOLD) {
    alerts.push({
      type: 'high_cat_a',
      severity: catA >= 10 ? 'critical' : 'warning',
      value: catA,
    })
  }

  // ── 3. Overdue preservation ─────────────────────────────────────────────
  const overduePres = overduePresCount ?? 0
  if (overduePres > 0) {
    alerts.push({
      type: 'overdue_preservation',
      severity: overduePres >= 5 ? 'warning' : 'info',
      value: overduePres,
    })
  }

  // ── 4. Overdue work plans ───────────────────────────────────────────────
  const overdueWp = overdueWpCount ?? 0
  if (overdueWp > 0) {
    alerts.push({
      type: 'overdue_work_plans',
      severity: 'info',
      value: overdueWp,
    })
  }

  return alerts
}
