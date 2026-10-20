import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { fetchAllRows } from './fetch-all'

type Client = SupabaseClient<Database>
type Scope = { orgId?: string; projectId?: string }

/**
 * Agregados SQL (Sprint E) — sustituyen a cargar todas las filas de itrs /
 * punches / certificates y contar en JavaScript.
 */

function rpcArgs(scope: Scope) {
  return {
    p_project_id: scope.projectId ?? undefined,
    p_org_id: scope.projectId ? undefined : scope.orgId,
  }
}

export type ItrPhaseCount = { project_id: string; phase_id: string; status: string; n: number }
export async function fetchItrPhaseCounts(supabase: Client, scope: Scope): Promise<ItrPhaseCount[]> {
  const { data, error } = await supabase.rpc('project_itr_phase_counts', rpcArgs(scope))
  if (error) throw new Error(error.message)
  return ((data ?? []) as ItrPhaseCount[]).map(r => ({ ...r, n: Number(r.n) }))
}

export type PunchCount = { project_id: string; category: 'A' | 'B' | 'C'; status: string; n: number }
export async function fetchPunchCounts(supabase: Client, scope: Scope): Promise<PunchCount[]> {
  const { data, error } = await supabase.rpc('project_punch_counts', rpcArgs(scope))
  if (error) throw new Error(error.message)
  return ((data ?? []) as PunchCount[]).map(r => ({ ...r, n: Number(r.n) }))
}

export type CertCount = { project_id: string; status: string; n: number }
export async function fetchCertCounts(supabase: Client, scope: Scope): Promise<CertCount[]> {
  const { data, error } = await supabase.rpc('project_cert_counts', rpcArgs(scope))
  if (error) throw new Error(error.message)
  return ((data ?? []) as CertCount[]).map(r => ({ ...r, n: Number(r.n) }))
}

export type SubsystemPhaseItrCount = { subsystem_id: string; phase_id: string; itr_total: number; itr_approved: number }
/** S09 (B-02): ITR por (subsistema, fase), paginado (una fila por combinación). */
export async function fetchSubsystemPhaseItrCounts(supabase: Client, projectId: string): Promise<SubsystemPhaseItrCount[]> {
  const data = await fetchAllRows(
    () => supabase.rpc('subsystem_phase_itr_counts', { p_project_id: projectId }).order('subsystem_id'),
    { key: 'phase_id' },
  )
  return (data as SubsystemPhaseItrCount[]).map(r => ({ ...r, itr_total: Number(r.itr_total), itr_approved: Number(r.itr_approved) }))
}

export type PreservationDueCount = { project_id: string; active: number; overdue: number; due_soon: number }
/** S09 (B-24): preservación activa / vencida / por vencer con la definición única de SQL. */
export async function fetchPreservationDueCounts(supabase: Client, projectIds: string[], days = 7): Promise<PreservationDueCount[]> {
  if (projectIds.length === 0) return []
  const { data, error } = await supabase.rpc('preservation_due_counts', { p_project_ids: projectIds, p_days: days })
  if (error) throw new Error(error.message)
  return ((data ?? []) as PreservationDueCount[]).map(r => ({
    project_id: r.project_id, active: Number(r.active), overdue: Number(r.overdue), due_soon: Number(r.due_soon),
  }))
}

export type SubsystemRollup = {
  subsystem_id: string
  tag_count: number
  itr_total: number
  itr_approved: number
  open_punches_a: number
  open_punches_b: number
  open_punches_c: number
}
export async function fetchSubsystemRollup(supabase: Client, projectId: string): Promise<Map<string, SubsystemRollup>> {
  // S09 (B-07): una fila por subsistema → con más de 1000 subsistemas hay que paginar.
  const data = await fetchAllRows(() => supabase.rpc('subsystem_rollup', { p_project_id: projectId }), { key: 'subsystem_id' })
  const map = new Map<string, SubsystemRollup>()
  for (const r of data as SubsystemRollup[]) {
    map.set(r.subsystem_id, {
      subsystem_id: r.subsystem_id,
      tag_count: Number(r.tag_count),
      itr_total: Number(r.itr_total),
      itr_approved: Number(r.itr_approved),
      open_punches_a: Number(r.open_punches_a),
      open_punches_b: Number(r.open_punches_b),
      open_punches_c: Number(r.open_punches_c),
    })
  }
  return map
}

// ── Helpers de suma ──────────────────────────────────────────────────────
const OPEN = new Set(['open', 'in_progress'])

export function sumItr(rows: ItrPhaseCount[], pred: (r: ItrPhaseCount) => boolean = () => true): number {
  return rows.reduce((a, r) => (pred(r) ? a + r.n : a), 0)
}
export function sumPunch(rows: PunchCount[], pred: (r: PunchCount) => boolean = () => true): number {
  return rows.reduce((a, r) => (pred(r) ? a + r.n : a), 0)
}
export function isOpenPunch(r: PunchCount): boolean { return OPEN.has(r.status) }
export function sumCert(rows: CertCount[], pred: (r: CertCount) => boolean = () => true): number {
  return rows.reduce((a, r) => (pred(r) ? a + r.n : a), 0)
}
