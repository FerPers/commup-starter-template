'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sys = (ss as any).systems
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

export async function takeProjectSnapshot(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { success: false, error: 'Sin sesión' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { success: false, error: 'Sin permisos' }

  const { supabase } = ctx

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)
    .single()
  if (!project) return { success: false, error: 'Proyecto no encontrado' }

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: itrs },
    { data: punches },
    { count: tagCount },
    { data: preservationPlans },
  ] = await Promise.all([
    supabase.from('itrs').select('id, status').eq('project_id', projectId),
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
  revalidatePath(`/projects/${projectId}/kpis`)
  return { success: true }
}
