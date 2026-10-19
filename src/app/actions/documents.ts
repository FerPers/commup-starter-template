'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import {
  COMPANY_KINDS, DOC_TYPES, REFERENCE_KINDS, REVISION_STATUSES, REVALIDATION_MIN, isDocumentPathFor, isHttpsUrl,
  type CompanyKind, type DocType, type ReferenceKind, type RevisionStatus,
} from '@/lib/documents/catalog'

// Empresas y registro maestro de documentos (fase 8 plan readiness, sesión 1; migración 20261021120000).
// Toda escritura pasa por RPC SECURITY DEFINER, que aplica roles (empresas = owner/admin; documentos = líder+;
// referencias = miembro no-client), el bloqueo de registros firmados y la revalidación con motivo.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)
const opt = (v: string | null | undefined) => ((v ?? '') === '' ? null : v) as unknown as string

function revalidateDocs(projectId: string, documentId?: string) {
  revalidatePath(`/projects/${projectId}/documents`)
  if (documentId) revalidatePath(`/projects/${projectId}/documents/${documentId}`)
  revalidatePath('/control-tower', 'layout')
}

// ── Empresas ────────────────────────────────────────────────────────────
export const saveCompany = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { id?: string; name: string; shortName?: string; kind: CompanyKind; taxId?: string; notes?: string; isActive?: boolean }): Promise<{ id?: string; error?: string }> => {
    if (!COMPANY_KINDS.includes(input.kind)) return { error: 'Tipo de empresa no válido' }
    if (!txt(input.name, 160)) return { error: 'El nombre es obligatorio' }
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
    if (!DOC_TYPES.includes(input.docType)) return { error: 'Tipo de documento no válido' }
    if (!txt(input.number, 80) || !txt(input.title, 300)) return { error: 'Número y título son obligatorios' }
    const { data, error } = await ctx.supabase.rpc('save_document', {
      p_project_id: input.projectId, p_id: opt(input.id), p_number: txt(input.number, 80), p_title: txt(input.title, 300),
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
    if (!REVISION_STATUSES.includes(input.status)) return { error: 'Estado no válido' }
    if (!txt(input.rev, 20)) return { error: 'Indica la revisión' }
    if (input.filePath && !isDocumentPathFor(input.filePath, input.projectId, input.documentId)) return { error: 'Archivo no válido' }
    const url = txt(input.externalUrl, 1000)
    if (url && !isHttpsUrl(url)) return { error: 'El enlace debe empezar con https://' }
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
    if (input.status !== null && (!REVISION_STATUSES.includes(input.status) || input.status === 'draft')) return { error: 'Estado no válido' }
    const { error } = await ctx.supabase.rpc('issue_document_revision', {
      p_revision_id: input.revisionId, p_status: opt(input.status), p_issued_on: opt(input.issuedOn),
    })
    if (error) return { error: error.message }
    revalidateDocs(input.projectId, input.documentId)
    return {}
  },
)

export const getDocumentFileUrl = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; revisionId: string }): Promise<{ url?: string; error?: string }> => {
    const { data: rev } = await ctx.supabase.from('document_revisions').select('file_path')
      .eq('id', input.revisionId).eq('project_id', input.projectId).maybeSingle()
    if (!rev?.file_path) return { error: 'La revisión no tiene archivo' }
    const { data, error } = await ctx.supabase.storage.from('project-documents').createSignedUrl(rev.file_path, 300)
    if (error || !data) return { error: error?.message ?? 'No se pudo abrir el archivo' }
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
    if (!REFERENCE_KINDS.includes(input.kind)) return { error: 'Tipo de referencia no válido' }
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
    const reason = txt(input.reason, 2000)
    if (input.locked && reason.length < REVALIDATION_MIN) return { error: `Indica el motivo (mín. ${REVALIDATION_MIN} caracteres)` }
    const { error } = await ctx.supabase.rpc('update_document_reference', { p_reference_id: input.referenceId, p_reason: opt(reason) })
    if (error) return { error: error.message }
    revalidateTarget(input)
    return {}
  },
)
