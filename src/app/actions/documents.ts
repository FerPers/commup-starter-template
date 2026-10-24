'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { normalizePidRef } from '@/lib/excel/normalize'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import {
  COMPANY_KINDS, DOC_TYPES, REFERENCE_KINDS, REVISION_STATUSES, REVALIDATION_MIN, VOID_REASON_MIN, documentPolicy, isDocumentPathFor, isHttpsUrl,
  type CompanyKind, type DocType, type DocumentPolicy, type ReferenceKind, type RevisionStatus,
} from '@/lib/documents/catalog'
import { sqlArg } from '@/lib/supabase/casts'

// Empresas y registro maestro de documentos (fase 8 plan readiness, sesión 1; migración 20261021120000).
// Toda escritura pasa por RPC SECURITY DEFINER, que aplica roles (empresas = owner/admin; documentos = líder+;
// referencias = miembro no-client), el bloqueo de registros firmados y la revalidación con motivo.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)
const opt = (v: string | null | undefined) => sqlArg<string>(((v ?? '') === '' ? null : v))

function revalidateDocs(projectId: string, documentId?: string) {
  revalidatePath(`/projects/${projectId}/documents`)
  if (documentId) revalidatePath(`/projects/${projectId}/documents/${documentId}`)
  revalidatePath('/projects/[id]', 'layout')
}

// ── Empresas ────────────────────────────────────────────────────────────
export const saveCompany = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { id?: string; name: string; shortName?: string; kind: CompanyKind; taxId?: string; notes?: string; isActive?: boolean }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!COMPANY_KINDS.includes(input.kind)) return { error: t('documents.invalidCompanyKind') }
    if (!txt(input.name, 160)) return { error: t('documents.nameRequired') }
    const { data, error } = await ctx.supabase.rpc('save_company', {
      p_org_id: ctx.orgId, p_id: opt(input.id), p_name: txt(input.name, 160), p_short_name: opt(txt(input.shortName, 40)),
      p_kind: input.kind, p_tax_id: opt(txt(input.taxId, 40)), p_notes: opt(txt(input.notes, 2000)), p_is_active: input.isActive ?? true,
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/companies')
    revalidatePath('/admin/users')
    return { id: data as string }
  },
)

export const setMemberCompany = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { userId: string; companyId: string | null }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('set_member_company', {
      p_org_id: ctx.orgId, p_user_id: input.userId, p_company_id: opt(input.companyId),
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/users')
    return {}
  },
)

// ── Documentos ──────────────────────────────────────────────────────────
export const saveDocument = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; id?: string; number: string; title: string; docType: DocType
    disciplineId?: string | null; companyId?: string | null; systemIds: string[]
  }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!DOC_TYPES.includes(input.docType)) return { error: t('documents.invalidDocType') }
    if (!txt(input.number, 80) || !txt(input.title, 300)) return { error: t('documents.numberTitleRequired') }
    // N2d: el número de un P&ID se normaliza como el campo «P&ID» de tags y señales, para que el plano se encuentre.
    const number = input.docType === 'pid' ? (normalizePidRef(input.number) ?? '') : txt(input.number, 80)
    const { data, error } = await ctx.supabase.rpc('save_document', {
      p_project_id: input.projectId, p_id: opt(input.id), p_number: number.slice(0, 80), p_title: txt(input.title, 300),
      p_doc_type: input.docType, p_discipline_id: opt(input.disciplineId), p_company_id: opt(input.companyId),
      p_systems: (input.systemIds ?? []).slice(0, 200),
    })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, data as string)
    return { id: data as string }
  },
)

export const addDocumentRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; documentId: string; rev: string; status: RevisionStatus; issuedOn?: string | null
    filePath?: string | null; fileName?: string | null; externalUrl?: string | null; notes?: string | null
  }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!REVISION_STATUSES.includes(input.status)) return { error: t('documents.invalidStatus') }
    if (!txt(input.rev, 20)) return { error: t('documents.revisionRequired') }
    if (input.filePath && !isDocumentPathFor(input.filePath, input.projectId, input.documentId)) return { error: t('documents.invalidFile') }
    const url = txt(input.externalUrl, 1000)
    if (url && !isHttpsUrl(url)) return { error: t('documents.httpsRequired') }
    const { data, error } = await ctx.supabase.rpc('add_document_revision', {
      p_document_id: input.documentId, p_rev: txt(input.rev, 20), p_status: input.status,
      p_issued_on: opt(input.issuedOn), p_file_path: opt(input.filePath), p_file_name: opt(txt(input.fileName, 255)),
      p_external_url: opt(url), p_notes: opt(txt(input.notes, 2000)),
    })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    return { id: data as string }
  },
)

/** Emite un borrador (status) o lo descarta (status = null). */
export const issueDocumentRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; documentId: string; revisionId: string; status: RevisionStatus | null; issuedOn?: string | null }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (input.status !== null && (!REVISION_STATUSES.includes(input.status) || input.status === 'draft')) return { error: t('documents.invalidStatus') }
    const { error } = await ctx.supabase.rpc('issue_document_revision', {
      p_revision_id: input.revisionId, p_status: opt(input.status), p_issued_on: opt(input.issuedOn),
    })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    return {}
  },
)

/** S13 (F-24): anula una revisión emitida (líder+, motivo ≥ 10); sale del cálculo de vigente. */
export const voidDocumentRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; documentId: string; revisionId: string; reason: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const reason = txt(input.reason, 2000)
    if (reason.length < VOID_REASON_MIN) return { error: t('documents.reasonMin', { min: VOID_REASON_MIN }) }
    const { error } = await ctx.supabase.rpc('void_document_revision', { p_revision_id: input.revisionId, p_reason: reason })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    return {}
  },
)

/** S13 (F-02): referencia la revisión vigente en todos los ITR sin firmas de los sistemas (vacío = los del documento). */
export const referenceDocumentInOpenItrs = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; documentId: string; systemIds?: string[] }): Promise<{ count?: number; error?: string }> => {
    const ids = (input.systemIds ?? []).slice(0, 200)
    const { data, error } = await ctx.supabase.rpc('reference_document_in_open_itrs', {
      p_document_id: input.documentId, ...(ids.length ? { p_system_ids: ids } : {}),
    })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    return { count: data as number }
  },
)

/**
 * S13 (F-02): lleva todas las referencias superadas del documento a la vigente. Abiertas = se actualizan;
 * firmadas/aprobadas = se revalidan con el motivo común (cada fila guarda quién, cuándo y desde qué revisión).
 */
export const revalidateDocumentReferences = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; documentId: string; reason: string }): Promise<{ updated?: number; revalidated?: number; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const reason = txt(input.reason, 2000)
    if (reason.length < REVALIDATION_MIN) return { error: t('documents.reasonMin', { min: REVALIDATION_MIN }) }
    const { data, error } = await ctx.supabase.rpc('revalidate_document_references', { p_document_id: input.documentId, p_reason: reason })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    const res = (data ?? {}) as { updated?: number; revalidated?: number }
    return { updated: res.updated ?? 0, revalidated: res.revalidated ?? 0 }
  },
)

/** S13 (F-20): política de la org frente a revisiones IFR/IFA (`organizations.settings.document_policy`). */
export const setDocumentPolicy = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: DocumentPolicy): Promise<{ error?: string }> => {
    const { data: org, error: fetchErr } = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.orgId).single()
    if (fetchErr) return { error: fetchErr.message }
    const settings = (org?.settings as Record<string, unknown> | null) ?? {}
    const before = documentPolicy(settings)
    const next = documentPolicy({ document_policy: input })
    const { error } = await ctx.supabase.from('organizations').update({ settings: { ...settings, document_policy: next } }).eq('id', ctx.orgId)
    if (error) return { error: error.message }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'document_policy.updated', entityType: 'organization', entityId: ctx.orgId,
      payload: { before, after: next },
    })
    revalidatePath('/projects', 'layout')
    return {}
  },
)

export const getDocumentFileUrl = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; revisionId: string }): Promise<{ url?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { data: rev } = await ctx.supabase.from('document_revisions').select('file_path')
      .eq('id', input.revisionId).eq('project_id', input.projectId).maybeSingle()
    if (!rev?.file_path) return { error: t('documents.noFile') }
    const { data, error } = await ctx.supabase.storage.from('project-documents').createSignedUrl(rev.file_path, 300)
    if (error || !data) return { error: error?.message ?? t('documents.fileOpenFailed') }
    return { url: data.signedUrl }
  },
)

// ── Referencias desde ITR / procedimiento ───────────────────────────────
function revalidateTarget(input: { projectId: string; path?: string }) {
  if (input.path?.startsWith(`/projects/${input.projectId}/`)) revalidatePath(input.path)
  revalidateDocs(input.projectId)
}

export const addDocumentReference = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; kind: ReferenceKind; targetId: string; documentId: string; path?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!REFERENCE_KINDS.includes(input.kind)) return { error: t('documents.invalidReferenceKind') }
    const { error } = await ctx.supabase.rpc('add_document_reference', {
      p_kind: input.kind, p_target_id: input.targetId, p_document_id: input.documentId,
    })
    if (error) return { error: error.message }
    revalidateTarget(input)
    return {}
  },
)

export const removeDocumentReference = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; referenceId: string; path?: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('remove_document_reference', { p_reference_id: input.referenceId })
    if (error) return { error: error.message }
    revalidateTarget(input)
    return {}
  },
)

/** Lleva la referencia a la revisión vigente; si el registro ya está firmado exige motivo (revalidación, líder+). */
export const updateDocumentReference = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; referenceId: string; reason?: string; locked?: boolean; path?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const reason = txt(input.reason, 2000)
    if (input.locked && reason.length < REVALIDATION_MIN) return { error: t('documents.reasonMin', { min: REVALIDATION_MIN }) }
    const { error } = await ctx.supabase.rpc('update_document_reference', { p_reference_id: input.referenceId, p_reason: opt(reason) })
    if (error) return { error: error.message }
    revalidateTarget(input)
    return {}
  },
)
