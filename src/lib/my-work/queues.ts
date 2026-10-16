/**
 * «Mi trabajo» — lógica pura de colas (Sprint N, 2026-09-04).
 * Sin BD: recibe filas ya consultadas y las clasifica, deduplica y ordena.
 * Tests en queues.test.ts. La página vive en src/app/(dashboard)/my-work.
 */
import type { OrgMemberRole } from '@/types/database'

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
}

export const EMPTY_COUNTS: MyWorkCounts = {
  itrs_execute: 0, itrs_review: 0, punches: 0, plan_items: 0, signatures: 0, preservation_overdue: 0,
  punches_verify: 0, punches_review: 0, actions_mine: 0, actions_verify: 0, constraints_mine: 0, handovers_to_receive: 0, holds_to_release: 0, lineup_to_verify: 0,
}

const SIGNER_ROLES: readonly OrgMemberRole[] = ['owner', 'admin', 'architect']
const OVERSIGHT_ROLES: readonly OrgMemberRole[] = ['owner', 'admin', 'architect', 'leader']

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
    + (role !== 'client' ? c.handovers_to_receive : 0) + c.holds_to_release
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
    itr_signatures: { role: string }[]
  } | null
}

export type ItrQueues<T extends AssignmentRow = AssignmentRow> = { execute: T[]; review: T[] }

/**
 * Separa mis asignaciones en «por ejecutar» (ejecutor, no aprobado) y «por revisar»
 * (supervisor/cliente, ITR completado sin mi firma). Deduplica por ITR dentro de cada cola.
 */
export function splitAssignments<T extends AssignmentRow>(rows: T[], projectIds: ReadonlySet<string>): ItrQueues<T> {
  const execute: T[] = []
  const review: T[] = []
  const seenExec = new Set<string>()
  const seenRev = new Set<string>()
  for (const row of rows) {
    const itr = row.itrs
    if (!itr || !projectIds.has(itr.project_id)) continue
    if (row.role === 'executor') {
      if (itr.status !== 'not_started' && itr.status !== 'in_progress') continue
      if (seenExec.has(itr.id)) continue
      seenExec.add(itr.id)
      execute.push(row)
    } else {
      if (itr.status !== 'completed') continue
      if (itr.itr_signatures.some(s => s.role === row.role)) continue
      if (seenRev.has(itr.id)) continue
      seenRev.add(itr.id)
      review.push(row)
    }
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
