/**
 * Gestión diaria (fase 5 del plan readiness, sesión 1 — 2026-10-16): acciones, restricciones, TQ y decisiones.
 *
 * Catálogo fijo de estados, orígenes y niveles. La BD (migración 20261017120000) aplica las mismas reglas
 * en las RPC SECURITY DEFINER: mantener en sincronía. Aquí solo hay lógica pura (tests en catalog.test.ts).
 */

export type MgmtKind = 'action' | 'constraint' | 'tq' | 'decision'
export const MGMT_KINDS: MgmtKind[] = ['action', 'constraint', 'tq', 'decision']
/** Entidades que admiten evidencia en mgmt-evidence (gestión diaria + reportes y FAT/SAT del vendor, fase 8). */
export type EvidenceKind = MgmtKind | 'vendor_report' | 'vendor_activity'
export const EVIDENCE_KINDS: EvidenceKind[] = [...MGMT_KINDS, 'vendor_report', 'vendor_activity']

// ── Acciones ────────────────────────────────────────────────────────────
export type ActionStatus = 'open' | 'in_progress' | 'done' | 'verified' | 'cancelled'
export type ActionSource = 'manual' | 'pssr' | 'constraint' | 'meeting' | 'tq' | 'vendor' | 'performance'
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low'
export type VerificationMethod = 'field' | 'document' | 'test' | 'review'

export const ACTION_STATUSES: ActionStatus[] = ['open', 'in_progress', 'done', 'verified', 'cancelled']
export const ACTION_LIVE: ActionStatus[] = ['open', 'in_progress', 'done']
/** Orígenes que el usuario elige a mano (pssr / constraint / tq nacen desde su registro). */
export const ACTION_FREE_SOURCES: ActionSource[] = ['manual', 'meeting', 'vendor', 'performance']
export const ACTION_SOURCES: ActionSource[] = ['manual', 'pssr', 'constraint', 'meeting', 'tq', 'vendor', 'performance']
export const ACTION_PRIORITIES: ActionPriority[] = ['critical', 'high', 'medium', 'low']
export const VERIFICATION_METHODS: VerificationMethod[] = ['field', 'document', 'test', 'review']
/** Orígenes que exigen el id del registro que la generó (CHECK actions_source_id_check). */
export const SOURCES_WITH_ID: ActionSource[] = ['pssr', 'constraint', 'tq']

/** «Hecha» exige evidencia adjunta salvo con método «revisión». */
export function actionNeedsEvidence(method: VerificationMethod): boolean {
  return method !== 'review'
}

// ── Restricciones ───────────────────────────────────────────────────────
export type ConstraintStatus = 'open' | 'resolved' | 'closed' | 'cancelled'
export type ImpactKind = 'safety' | 'schedule' | 'cost' | 'quality' | 'environment'
export type EscalationLevel = 1 | 2 | 3 | 4

export const CONSTRAINT_STATUSES: ConstraintStatus[] = ['open', 'resolved', 'closed', 'cancelled']
export const CONSTRAINT_LIVE: ConstraintStatus[] = ['open', 'resolved']
export const IMPACT_KINDS: ImpactKind[] = ['safety', 'schedule', 'cost', 'quality', 'environment']
/** 1 equipo · 2 gerente de comisionamiento · 3 gerente de proyecto · 4 cliente/sponsor (7.50). */
export const ESCALATION_LEVELS: EscalationLevel[] = [1, 2, 3, 4]
/** Desde este nivel una restricción abierta bloquea su gate (decisión §11.6); por debajo, condición. */
export const BLOCKING_LEVEL: EscalationLevel = 4

// ── TQ ──────────────────────────────────────────────────────────────────
export type TqStatus = 'draft' | 'issued' | 'answered' | 'closed' | 'cancelled'
export type TqAddressee = 'engineering' | 'vendor' | 'client' | 'other'
export const TQ_STATUSES: TqStatus[] = ['draft', 'issued', 'answered', 'closed', 'cancelled']
export const TQ_LIVE: TqStatus[] = ['draft', 'issued', 'answered']
export const TQ_ADDRESSEES: TqAddressee[] = ['engineering', 'vendor', 'client', 'other']

// ── Decisiones ──────────────────────────────────────────────────────────
export type DecisionStatus = 'active' | 'superseded'
export type DecisionSource = 'meeting' | 'tq' | 'constraint' | 'other'
export const DECISION_SOURCES: DecisionSource[] = ['meeting', 'tq', 'constraint', 'other']

// ── Comunes ─────────────────────────────────────────────────────────────
/** Fecha YYYY-MM-DD vencida respecto de `today` (YYYY-MM-DD, hora local del proyecto). */
export function isOverdue(date: string | null | undefined, today: string): boolean {
  return !!date && date < today
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Días de atraso (0 si no venció). */
export function daysOverdue(date: string | null | undefined, today: string): number {
  if (!isOverdue(date, today)) return 0
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Ruta de evidencia en el bucket mgmt-evidence (la política y la RPC exigen este prefijo). */
export function evidencePath(projectId: string, kind: EvidenceKind, entityId: string, fileName: string, stamp = Date.now()): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'archivo'
  return `${projectId}/${kind}/${entityId}/${stamp}-${safe}`
}

/** Orden del tracker: vencidas primero, luego prioridad, luego fecha. */
const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
export function compareActions(
  a: { priority: ActionPriority; due_date: string | null; number: string },
  b: { priority: ActionPriority; due_date: string | null; number: string },
  today: string,
): number {
  const oa = isOverdue(a.due_date, today) ? 0 : 1
  const ob = isOverdue(b.due_date, today) ? 0 : 1
  if (oa !== ob) return oa - ob
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if ((a.due_date ?? '9999') !== (b.due_date ?? '9999')) return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1
  return a.number.localeCompare(b.number)
}
