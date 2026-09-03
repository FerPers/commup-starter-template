import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

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
  const { data, error } = await supabase.rpc('subsystem_rollup', { p_project_id: projectId })
  if (error) throw new Error(error.message)
  const map = new Map<string, SubsystemRollup>()
  for (const r of (data ?? []) as SubsystemRollup[]) {
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
