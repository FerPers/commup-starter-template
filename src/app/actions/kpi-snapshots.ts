'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'

// getSubsystemKpis / getProjectSnapshots devuelven arrays pelados (no satisfacen
// el constraint ActionResult del wrapper) — quedan manuales con getCtx; son
// lecturas RLS-bound. takeProjectSnapshot (escritura) sí usa el wrapper.

// ── Types ──────────────────────────────────────────────────────────────────

export type SubsystemKpi = {
  id: string
  code: string
  name: string
  systemCode: string
  systemName: string
  totalItrs: number
  approvedItrs: number
  completionPct: number
  openCatA: number
  openCatB: number
}

export type SnapshotRow = {
  snapshot_date: string
  completion_pct: number
  total_itrs: number
  completed_itrs: number
  open_punches_a: number
  open_punches_b: number
}

// ── getSubsystemKpis ───────────────────────────────────────────────────────

export async function getSubsystemKpis(projectId: string): Promise<SubsystemKpi[]> {
  const ctx = await getCtx()
  if (!ctx) return []

  const { supabase } = ctx

  const [{ data: subsystems }, { data: itrs }, { data: punches }] = await Promise.all([
    supabase
      .from('subsystems')
      .select('id, code, name, systems(id, code, name)')
      .eq('project_id', projectId)
      .order('code'),
    supabase
      .from('itrs')
      .select('id, status, subsystem_id')
      .eq('project_id', projectId),
    supabase
      .from('punches')
      .select('id, subsystem_id, category, status')
      .eq('project_id', projectId)
      .not('status', 'in', '(closed,cancelled)'),
  ])

  return (subsystems ?? []).map(ss => {
    const sys = ss.systems
    const ssItrs = (itrs ?? []).filter(i => i.subsystem_id === ss.id)
    const totalItrs = ssItrs.length
    const approvedItrs = ssItrs.filter(i => i.status === 'approved').length
    const completionPct = totalItrs > 0 ? Math.round((approvedItrs / totalItrs) * 100) : 0
    const ssPunches = (punches ?? []).filter(p => p.subsystem_id === ss.id)

    return {
      id: ss.id,
      code: ss.code,
      name: ss.name,
      systemCode: sys?.code ?? '—',
      systemName: sys?.name ?? '—',
      totalItrs,
      approvedItrs,
      completionPct,
      openCatA: ssPunches.filter(p => p.category === 'A').length,
      openCatB: ssPunches.filter(p => p.category === 'B').length,
    }
  })
}

// ── getProjectSnapshots ────────────────────────────────────────────────────

export async function getProjectSnapshots(projectId: string): Promise<SnapshotRow[]> {
  const ctx = await getCtx()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('kpi_snapshots')
    .select('snapshot_date, completion_pct, total_itrs, completed_itrs, open_punches_a, open_punches_b')
    .eq('project_id', projectId)
    .is('phase_id', null)
    .is('subsystem_id', null)
    .order('snapshot_date', { ascending: true })

  return (data ?? []).map(d => ({
    snapshot_date: d.snapshot_date as string,
    completion_pct: Number(d.completion_pct),
    total_itrs: d.total_itrs as number,
    completed_itrs: d.completed_itrs as number,
    open_punches_a: d.open_punches_a as number,
    open_punches_b: d.open_punches_b as number,
  }))
}

// ── takeProjectSnapshot ────────────────────────────────────────────────────

export const takeProjectSnapshot = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    projectId: string,
  ): Promise<{ success?: boolean; error?: string }> => {
    const { supabase } = ctx

    const access = await checkProjectAccess(supabase, ctx.orgId, projectId)
    if (!access.ok) return { success: false, error: access.error }

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: itrs },
    { data: punches },
    { count: tagCount },
    { data: preservationPlans },
  ] = await Promise.all([
    supabase.from('itrs').select('id, status, phase_id').eq('project_id', projectId),
    supabase.from('punches').select('id, category, status').eq('project_id', projectId),
    supabase.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase
      .from('preservation_plans')
      .select('id, next_due_date')
      .eq('project_id', projectId)
      .eq('status', 'active'),
  ])

  const totalItrs = itrs?.length ?? 0
  const completedItrs = itrs?.filter(i => i.status === 'approved').length ?? 0
  const punchesA = (punches ?? []).filter(p => p.category === 'A')
  const punchesB = (punches ?? []).filter(p => p.category === 'B')
  const openPunchesA = punchesA.filter(p => !['closed', 'cancelled'].includes(p.status)).length
  const openPunchesB = punchesB.filter(p => !['closed', 'cancelled'].includes(p.status)).length
  const overduePreservation = (preservationPlans ?? []).filter(p => (p.next_due_date as string) < today).length
  const completionPct = totalItrs > 0 ? Number(((completedItrs / totalItrs) * 100).toFixed(2)) : 0

  // Remove existing snapshot for today at project level (re-snapshot same day)
  await supabase
    .from('kpi_snapshots')
    .delete()
    .eq('project_id', projectId)
    .eq('snapshot_date', today)
    .is('phase_id', null)
    .is('subsystem_id', null)
    .is('area_id', null)
    .is('system_id', null)

  const { error } = await supabase.from('kpi_snapshots').insert({
    project_id: projectId,
    area_id: null,
    system_id: null,
    subsystem_id: null,
    phase_id: null,
    total_itrs: totalItrs,
    completed_itrs: completedItrs,
    total_punches_a: punchesA.length,
    open_punches_a: openPunchesA,
    total_punches_b: punchesB.length,
    open_punches_b: openPunchesB,
    total_tags: tagCount ?? 0,
    total_preservation: preservationPlans?.length ?? 0,
    overdue_preservation: overduePreservation,
    completion_pct: completionPct,
    snapshot_date: today,
  })

  if (error) return { success: false, error: error.message }

  // ── Per-phase snapshots (mismo criterio que /api/cron/snapshot) ──────────
  const phaseIds = [...new Set((itrs ?? []).map(i => i.phase_id).filter((p): p is string => !!p))]

  await supabase
    .from('kpi_snapshots')
    .delete()
    .eq('project_id', projectId)
    .eq('snapshot_date', today)
    .not('phase_id', 'is', null)

  if (phaseIds.length > 0) {
    const phaseRows = phaseIds.map(phaseId => {
      const phaseItrs = (itrs ?? []).filter(i => i.phase_id === phaseId)
      const phaseTotal = phaseItrs.length
      const phaseDone = phaseItrs.filter(i => i.status === 'approved').length
      return {
        project_id: projectId,
        area_id: null,
        system_id: null,
        subsystem_id: null,
        phase_id: phaseId,
        total_itrs: phaseTotal,
        completed_itrs: phaseDone,
        total_punches_a: 0,
        open_punches_a: 0,
        total_punches_b: 0,
        open_punches_b: 0,
        total_tags: 0,
        total_preservation: 0,
        overdue_preservation: 0,
        completion_pct: phaseTotal > 0 ? Number(((phaseDone / phaseTotal) * 100).toFixed(2)) : 0,
        snapshot_date: today,
      }
    })
    const { error: phaseErr } = await supabase.from('kpi_snapshots').insert(phaseRows)
    if (phaseErr) return { success: false, error: `Snapshot de proyecto OK pero fases fallaron: ${phaseErr.message}` }
  }

    revalidatePath(`/projects/${projectId}/kpis`)
    return { success: true }
  },
)
