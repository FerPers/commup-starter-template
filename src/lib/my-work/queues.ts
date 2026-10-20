/**
 * «Mi trabajo» — lógica pura de colas (Sprint N, 2026-09-04).
 * Sin BD: recibe filas ya consultadas y las clasifica, deduplica y ordena.
 * Tests en queues.test.ts. La página vive en src/app/(dashboard)/my-work.
 */
import type { OrgMemberRole } from '@/types/database'
import { normalizeRequired } from '@/lib/itr/signatures'
import { tierRoles } from '@/lib/constants/roles'

export type MyWorkCounts = {
  itrs_execute: number
  itrs_review: number
  punches: number
  plan_items: number
  signatures: number
  preservation_overdue: number
  /** Punch resueltos por otros, esperando verificación en campo (fase 4). */
  punches_verify: number
  /** Punch sin revisión de categoría levantados por otros (solo supervisores; la RPC da 0 al resto). */
  punches_review: number
  /** Acciones abiertas o en curso de las que soy responsable (fase 5). */
  actions_mine: number
  /** Acciones hechas por otros, esperando verificación (la RPC da 0 al rol client). */
  actions_verify: number
  /** Restricciones abiertas de las que soy responsable (fase 5). */
  constraints_mine: number
  /** Relevos de turno entregados por otros, esperando que alguien los reciba (fase 5, sesión 3). */
  handovers_to_receive: number
  /** Hold points detenidos que mi rol puede liberar y que no ejecuté yo (fase 6). */
  holds_to_release: number
  /** Filas críticas de line-up alineadas por otros, esperando verificación independiente (fase 6). */
  lineup_to_verify: number
  /** Hitos de arranque registrados por otros que mi rol puede atestiguar (fase 6, sesión 2). */
  milestones_to_witness: number
  /** Traspasos de propiedad del sistema pendientes de una firma que mi rol puede dar (fase 6, sesión 3). */
  transfers_to_sign: number
  /** Intentos de prueba de desempeño cerrados sin resultado (líderes+, fase 7). */
  performance_to_decide: number
  /** Certificados PTC pendientes de una firma que mi rol puede dar (fase 7). */
  performance_to_sign: number
}

export const EMPTY_COUNTS: MyWorkCounts = {
  itrs_execute: 0, itrs_review: 0, punches: 0, plan_items: 0, signatures: 0, preservation_overdue: 0,
  punches_verify: 0, punches_review: 0, actions_mine: 0, actions_verify: 0, constraints_mine: 0, handovers_to_receive: 0, holds_to_release: 0, lineup_to_verify: 0, milestones_to_witness: 0, transfers_to_sign: 0,
  performance_to_decide: 0, performance_to_sign: 0,
}

const SIGNER_ROLES: readonly OrgMemberRole[] = tierRoles('privileged')
const OVERSIGHT_ROLES: readonly OrgMemberRole[] = tierRoles('editor')

export function parseCounts(raw: unknown): MyWorkCounts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const n = (k: keyof MyWorkCounts) => {
    const v = Number(r[k])
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  }
  return {
    itrs_execute: n('itrs_execute'), itrs_review: n('itrs_review'), punches: n('punches'),
    plan_items: n('plan_items'), signatures: n('signatures'), preservation_overdue: n('preservation_overdue'),
    punches_verify: n('punches_verify'), punches_review: n('punches_review'),
    actions_mine: n('actions_mine'), actions_verify: n('actions_verify'), constraints_mine: n('constraints_mine'),
    handovers_to_receive: n('handovers_to_receive'), holds_to_release: n('holds_to_release'), lineup_to_verify: n('lineup_to_verify'),
    milestones_to_witness: n('milestones_to_witness'), transfers_to_sign: n('transfers_to_sign'),
    performance_to_decide: n('performance_to_decide'), performance_to_sign: n('performance_to_sign'),
  }
}

/** ¿Este rol firma certificados (ve la cola de firmas)? */
export function canSignCertificates(role: OrgMemberRole): boolean {
  return SIGNER_ROLES.includes(role)
}

/** ¿Este rol supervisa preservación (ve la cola de vencidos)? */
export function seesPreservation(role: OrgMemberRole): boolean {
  return OVERSIGHT_ROLES.includes(role)
}

/**
 * Total del badge del sidebar: solo lo que es personal o que ese rol debe atender. La revisión de
 * categoría es tarea del supervisor (cuenta); la verificación en campo la puede hacer cualquiera
 * distinto de quien resolvió, así que se muestra en su cola pero no infla el badge de todos (igual las
 * acciones por verificar). Mis acciones y mis restricciones sí cuentan: son personales.
 */
export function badgeTotal(c: MyWorkCounts, role: OrgMemberRole): number {
  return c.itrs_execute + c.itrs_review + c.punches + c.plan_items + (canSignCertificates(role) ? c.signatures : 0)
    + (seesPreservation(role) ? c.punches_review : 0) + c.actions_mine + c.constraints_mine
    + (role !== 'client' ? c.handovers_to_receive : 0) + c.holds_to_release + c.milestones_to_witness + c.transfers_to_sign
    + c.performance_to_decide + c.performance_to_sign
}

export type DueState = 'overdue' | 'today' | 'future' | null

/** Estado de vencimiento de una fecha ISO (YYYY-MM-DD) respecto a hoy. */
export function dueState(date: string | null | undefined, today: string): DueState {
  if (!date) return null
  const d = date.slice(0, 10)
  if (d < today) return 'overdue'
  if (d === today) return 'today'
  return 'future'
}

export type AssignmentRow = {
  role: 'executor' | 'supervisor' | 'client'
  itrs: {
    id: string
    itr_number: string
    status: string
    progress_pct: number
    scheduled_date: string | null
    completed_date: string | null
    project_id: string
    tags: { id: string; tag_number: string; description: string } | null
    projects: { code: string } | null
    project_phases: { code: string; color: string } | null
    itr_signatures: { role: string; user_id?: string }[]
    /** S04 (D4): firmas que exige el ITR; ausente = ejecutor + supervisor. */
    required_signatures?: string[] | null
  } | null
}

export type ItrQueues<T extends AssignmentRow = AssignmentRow> = { execute: T[]; review: T[] }

/** Orden de firma del ITR (igual que sign_itr_atomic: cada rol exige las firmas requeridas anteriores). */
export { ITR_SIGNING_ORDER } from '@/lib/itr/signatures'

/**
 * ¿Es mi turno de firmar con este rol? Colas por «siguiente firma pendiente» (C-17): el ejecutor
 * mientras no firme (aunque el contenido ya esté completo, o el ITR esté rechazado por una falla
 * crítica que debe corregir); los demás roles cuando firmaron los requeridos anteriores. S04: solo
 * cuentan los roles que el ITR exige (D4) y nunca si ya firmé otro rol del mismo ITR (D6). Mismo
 * criterio que my_work_counts en SQL.
 */
export function isMyTurnToSign(
  role: AssignmentRow['role'],
  status: string,
  signedRoles: ReadonlyArray<string>,
  required: ReadonlyArray<string> | null | undefined,
  signedByMe = false,
): boolean {
  const req = normalizeRequired(required)
  if (status === 'approved' || signedByMe || !req.includes(role) || signedRoles.includes(role)) return false
  if (role === 'executor') return true
  if (status !== 'completed') return false
  return req.slice(0, req.indexOf(role)).every(r => signedRoles.includes(r))
}

/**
 * Separa mis asignaciones en «por ejecutar» (ejecutor sin su firma) y «por revisar» (supervisor o
 * cliente a quien le toca firmar, ver isMyTurnToSign). Deduplica por ITR dentro de cada cola.
 */
export function splitAssignments<T extends AssignmentRow>(rows: T[], projectIds: ReadonlySet<string>, userId?: string): ItrQueues<T> {
  const execute: T[] = []
  const review: T[] = []
  const seenExec = new Set<string>()
  const seenRev = new Set<string>()
  for (const row of rows) {
    const itr = row.itrs
    if (!itr || !projectIds.has(itr.project_id)) continue
    const signedByMe = !!userId && itr.itr_signatures.some(s => s.user_id === userId)
    if (!isMyTurnToSign(row.role, itr.status, itr.itr_signatures.map(s => s.role), itr.required_signatures, signedByMe)) continue
    const [queue, seen] = row.role === 'executor' ? [execute, seenExec] : [review, seenRev]
    if (seen.has(itr.id)) continue
    seen.add(itr.id)
    queue.push(row)
  }
  const byDate = (get: (r: T) => string | null | undefined) => (a: T, b: T) =>
    (get(a) ?? '9999-12-31').localeCompare(get(b) ?? '9999-12-31') || (a.itrs!.itr_number).localeCompare(b.itrs!.itr_number)
  execute.sort(byDate(r => r.itrs?.scheduled_date))
  review.sort(byDate(r => r.itrs?.completed_date))
  return { execute, review }
}

export type PunchRow = { category: 'A' | 'B' | 'C'; target_date: string | null; punch_number: string }

const CAT_ORDER: Record<PunchRow['category'], number> = { A: 0, B: 1, C: 2 }

/** Cat A primero; dentro de la categoría, fecha objetivo más cercana (sin fecha al final). */
export function sortPunches<T extends PunchRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    CAT_ORDER[a.category] - CAT_ORDER[b.category]
    || (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31')
    || a.punch_number.localeCompare(b.punch_number),
  )
}

/** Días enteros de atraso de una fecha ISO respecto a hoy (0 si no está vencida). */
export function daysOverdue(date: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0
}
