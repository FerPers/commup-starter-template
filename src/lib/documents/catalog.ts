// Empresas y registro maestro de documentos (fase 8 plan readiness, sesión 1; doc §15, migración 20261021120000).
// Catálogos fijos = CHECK de la BD. Lógica pura (sin Supabase) para la UI y las acciones.

export const COMPANY_KINDS = ['owner', 'epc', 'vendor', 'subcontractor', 'other'] as const
export type CompanyKind = (typeof COMPANY_KINDS)[number]

export const DOC_TYPES = ['pid', 'pfd', 'datasheet', 'drawing', 'specification', 'procedure', 'manual', 'calculation', 'vendor', 'other'] as const
export type DocType = (typeof DOC_TYPES)[number]

/** Estados de una revisión, en orden de madurez (Draft → IFR → IFA → IFC → As-Built → Final). */
export const REVISION_STATUSES = ['draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final'] as const
export type RevisionStatus = (typeof REVISION_STATUSES)[number]
export const ISSUED_STATUSES: readonly RevisionStatus[] = REVISION_STATUSES.filter(s => s !== 'draft')
/** S13 (F-24): una revisión emitida se puede anular (sale del cálculo de vigente). No se registra así. */
export type RevisionRowStatus = RevisionStatus | 'void'

/** S13 (F-20): emitida para construcción o posterior. = SQL document_status_controlled(). */
export const DOC_CONTROLLED_STATUSES: readonly RevisionStatus[] = ['ifc', 'as_built', 'final']
export const isControlledStatus = (s: string | null | undefined) => !!s && (DOC_CONTROLLED_STATUSES as readonly string[]).includes(s)

/**
 * S13 (F-20): qué pasa al referenciar una revisión IFR/IFA. `warn` (defecto) = aviso; `block` = no se referencia
 * ni se firma contra ella. = SQL org_document_policy() sobre organizations.settings.document_policy.below_ifc.
 */
export type DocumentPolicy = { below_ifc: 'warn' | 'block' }
export function documentPolicy(settings: unknown): DocumentPolicy {
  const raw = (settings as { document_policy?: { below_ifc?: unknown } } | null)?.document_policy?.below_ifc
  return { below_ifc: raw === 'block' ? 'block' : 'warn' }
}

export const REFERENCE_KINDS = ['itr', 'procedure_revision'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/** Control documental = líder o superior (SQL document_is_controller). */
export const DOCUMENT_CONTROLLER_ROLES: readonly string[] = ['owner', 'admin', 'architect', 'leader']
export const isDocumentController = (role: string) => DOCUMENT_CONTROLLER_ROLES.includes(role)

/** Motivo mínimo para revalidar una referencia superada en un registro ya firmado (SQL: ≥ 10). */
export const REVALIDATION_MIN = 10

/** Motivo mínimo para anular una revisión emitida (SQL void_document_revision: ≥ 10). */
export const VOID_REASON_MIN = 10

export const STATUS_TONE: Record<RevisionRowStatus, 'muted' | 'blue' | 'violet' | 'green' | 'amber' | 'struck'> = {
  draft: 'muted', ifr: 'blue', ifa: 'violet', ifc: 'green', as_built: 'amber', final: 'green', void: 'struck',
}

/**
 * S13 (F-03): vigente = la emitida (no borrador ni anulada) con fecha de emisión más reciente; a igual fecha, la
 * última registrada. = SQL document_refresh_current().
 */
export function currentRevision<T extends { id: string; seq: number; status: string; issued_on: string | null }>(revs: readonly T[]): T | null {
  const issued = revs.filter(r => r.status !== 'draft' && r.status !== 'void')
  issued.sort((a, b) => (b.issued_on ?? '').localeCompare(a.issued_on ?? '') || b.seq - a.seq)
  return issued[0] ?? null
}

/** Ruta en el bucket project-documents: <project_id>/<document_id>/<id>-<nombre>. */
export function documentPath(projectId: string, documentId: string, fileName: string, id: string): string {
  const safe = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
  return `${projectId}/${documentId}/${id}-${safe || 'documento.pdf'}`
}

export function isDocumentPathFor(path: string, projectId: string, documentId: string): boolean {
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === projectId && parts[1] === documentId && !path.includes('..') && parts[2].length > 0
}

export const isHttpsUrl = (v: string) => /^https:\/\/[^\s]+$/i.test(v.trim())

/** Una referencia está superada si el documento tiene otra revisión vigente. */
export function isOutdated(ref: { revision_id: string }, currentRevisionId: string | null): boolean {
  return currentRevisionId !== null && ref.revision_id !== currentRevisionId
}
