'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSubsystemRollup } from '@/lib/list/kpi-query'
import { fetchAllRows } from '@/lib/list/fetch-all'

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
  /** D11: snapshot histórico que pudo calcularse sobre ≤1000 filas (no se recalcula). */
  suspect: boolean
}

/** Días de historial que se grafican (≈ 2 años; PostgREST corta en 1000 filas). */
const SNAPSHOT_HISTORY_DAYS = 730

// ── getSubsystemKpis ───────────────────────────────────────────────────────

export async function getSubsystemKpis(projectId: string): Promise<SubsystemKpi[]> {
  const ctx = await getCtx()
  if (!ctx) return []

  const { supabase } = ctx

  // Sprint E: rollup por subsistema en SQL
  const [{ data: subsystems }, rollup] = await Promise.all([
    fetchAllRows(() => supabase
      .from('subsystems')
      .select('id, code, name, systems(id, code, name)')
      .eq('project_id', projectId)
      .order('code')).then(data => ({ data })),
    fetchSubsystemRollup(supabase, projectId),
  ])

  return (subsystems ?? []).map(ss => {
    const sys = ss.systems
    const r = rollup.get(ss.id)
    const totalItrs = r?.itr_total ?? 0
    const approvedItrs = r?.itr_approved ?? 0
    const completionPct = totalItrs > 0 ? Math.round((approvedItrs / totalItrs) * 100) : 0

    return {
      id: ss.id,
      code: ss.code,
      name: ss.name,
      systemCode: sys?.code ?? '—',
      systemName: sys?.name ?? '—',
      totalItrs,
      approvedItrs,
      completionPct,
      openCatA: r?.open_punches_a ?? 0,
      openCatB: r?.open_punches_b ?? 0,
    }
  })
}

// ── getProjectSnapshots ────────────────────────────────────────────────────

export async function getProjectSnapshots(projectId: string): Promise<SnapshotRow[]> {
  const ctx = await getCtx()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('kpi_snapshots')
    .select('snapshot_date, completion_pct, total_itrs, completed_itrs, open_punches_a, open_punches_b, suspect')
    .eq('project_id', projectId)
    .is('phase_id', null)
    .is('subsystem_id', null)
    .order('snapshot_date', { ascending: false })
    .limit(SNAPSHOT_HISTORY_DAYS)

  // B-07: los más recientes (antes: los 1000 más antiguos, la curva dejaba de avanzar a los ~2,7 años)
  return (data ?? []).reverse().map(d => ({
    snapshot_date: d.snapshot_date as string,
    completion_pct: Number(d.completion_pct),
    total_itrs: d.total_itrs as number,
    completed_itrs: d.completed_itrs as number,
    open_punches_a: d.open_punches_a as number,
    open_punches_b: d.open_punches_b as number,
    suspect: !!d.suspect,
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

    const admin = createAdminClient()

    // S09 (B-01/B-25): snapshot KPI en SQL (conteos completos, upsert por clave única). Igual que
    // take_mgmt_snapshot, solo service_role escribe snapshots; el proyecto ya se verificó arriba.
    const { error: kpiErr } = await admin.rpc('take_kpi_snapshot', { p_project_id: projectId })  // S10: día local del proyecto
    if (kpiErr) return { success: false, error: kpiErr.message }

    // Readiness (fase 5): avance ponderado y KPIs de gestión diaria. take_mgmt_snapshot es solo de
    // service_role (escribe snapshots sin políticas de escritura); el proyecto ya se verificó arriba.
    const { error: mgmtErr } = await admin.rpc('take_mgmt_snapshot', { p_project_id: projectId })
    if (mgmtErr) return { success: false, error: mgmtErr.message }

    revalidatePath(`/projects/${projectId}/kpis`)
    return { success: true }
  },
)
