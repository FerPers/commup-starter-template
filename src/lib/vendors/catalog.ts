// Paquetes de vendor (fase 8 plan readiness, sesión 2; doc §15.5–15.13, migración 20261022120000).
// Catálogos fijos = CHECK / vendor_checklist_keys() de la BD. Lógica pura para la UI y las acciones.
import { ROLE_TIERS } from '@/lib/constants/roles'

export const PACKAGE_STATUSES = ['planned', 'mobilized', 'demobilized', 'cancelled'] as const
export type PackageStatus = (typeof PACKAGE_STATUSES)[number]

export const INTERFACE_STATUSES = ['open', 'agreed', 'closed'] as const
export type InterfaceStatus = (typeof INTERFACE_STATUSES)[number]

export const CHECKLIST_PHASES = ['mobilization', 'demobilization'] as const
export type ChecklistPhase = (typeof CHECKLIST_PHASES)[number]

/** = SQL vendor_checklist_keys(phase). */
export const VENDOR_CHECKLIST: Record<ChecklistPhase, readonly string[]> = {
  mobilization: ['scope_interfaces', 'hse_induction', 'permits', 'calibrated_equipment', 'documents_current'],
  demobilization: ['as_built_delivered', 'tools_removed', 'permits_closed', 'area_clean'],
}

export const ACTIVITY_KINDS = ['fat', 'sat'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export const ACTIVITY_RESULTS = ['pending', 'passed', 'passed_with_findings', 'failed'] as const
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number]

export const REPORT_KINDS = ['daily', 'final'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const RECOMMENDATION_STATUSES = ['proposed', 'approved', 'rejected', 'implemented'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export const PUNCH_CATEGORIES = ['A', 'B', 'C'] as const
export type PunchCategory = (typeof PUNCH_CATEGORIES)[number]

type Tone = 'muted' | 'blue' | 'amber' | 'green' | 'red' | 'violet' | 'struck'
export const PACKAGE_TONE: Record<PackageStatus, Tone> = { planned: 'blue', mobilized: 'amber', demobilized: 'green', cancelled: 'struck' }
export const INTERFACE_TONE: Record<InterfaceStatus, Tone> = { open: 'red', agreed: 'blue', closed: 'green' }
export const RESULT_TONE: Record<ActivityResult, Tone> = { pending: 'muted', passed: 'green', passed_with_findings: 'amber', failed: 'red' }
export const RECOMMENDATION_TONE: Record<RecommendationStatus, Tone> = { proposed: 'blue', approved: 'violet', rejected: 'struck', implemented: 'green' }

/** Gestión del paquete, resultado de FAT/SAT, decidir recomendaciones y (des)movilizar = líder+. */
export const VENDOR_LEAD_ROLES: readonly string[] = ROLE_TIERS.editor
export const isVendorLead = (role: string) => VENDOR_LEAD_ROLES.includes(role)

/** Un resultado distinto de «aprobada» necesita al menos un hallazgo registrado (la RPC lo exige). */
export const resultNeedsFindings = (result: ActivityResult) => result === 'passed_with_findings' || result === 'failed'

/** La recomendación pasa a implementada solo con número de MOC si lo requiere (§15.10). */
export function canImplement(rec: { status: RecommendationStatus; requires_moc: boolean }, mocReference: string): boolean {
  return rec.status === 'approved' && (!rec.requires_moc || mocReference.trim().length > 0)
}

/** Qué falta de un checklist (claves sin marcar), en el orden del catálogo. */
export function missingItems(phase: ChecklistPhase, done: ReadonlySet<string>): string[] {
  return VENDOR_CHECKLIST[phase].filter(k => !done.has(k))
}
