'use server'

import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { Eligibility } from '@/lib/certificates/eligibility'
import { CERT_ROLE_CAPACITY, type CertSignRole } from '@/lib/constants/capacities'
import { tierRoles } from '@/lib/constants/roles'
import { fromJson } from '@/lib/supabase/casts'

// S17 (A-05/D15, migración 20261112120000): toda escritura de certificados va por RPC SECURITY DEFINER
// (issue/sign/unsign/revoke/reopen_certificate, add/remove_certificate_exception), que validan elegibilidad,
// fase anterior, capacidad por rol y una persona por rol, y registran la auditoría. Aquí quedan solo las
// notificaciones (admin client). El bloqueo por cambio de base lo mantiene el trigger trg_certificate_base_changed.

type Notif = { org_id: string; recipient_user_id: string; kind: string; title: string; body: string | null; link_url: string; payload: Record<string, unknown> }

async function notify(rows: Notif[], tag: string) {
  if (rows.length === 0) return
  const { error } = await createAdminClient().from('notifications').insert(rows as never[])
  if (error) console.error(`[notifications.insert ${tag}]`, error)
}

/** Privilegiados de la org + designados del proyecto para alguna capacidad de firma de certificados. */
async function certificateSigners(orgId: string, projectId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: privileged }, { data: designated }] = await Promise.all([
    admin.from('org_members').select('user_id').eq('org_id', orgId).eq('status', 'active').in('role', tierRoles('privileged')),
    // bounded: designaciones vigentes de un proyecto (pocas personas por capacidad)
    admin.from('project_capacities').select('user_id').eq('project_id', projectId).is('revoked_at', null)
      .in('capacity', Object.values(CERT_ROLE_CAPACITY)),
  ])
  return Array.from(new Set([...(privileged ?? []), ...(designated ?? [])].map(r => r.user_id as string).filter(Boolean)))
}

/** Texto opcional recortado: vacío → undefined (la RPC lo guarda como NULL). */
const optText = (v?: string | null): string | undefined => (v?.trim() ? v.trim() : undefined)

async function certInfo(supabase: SupabaseClient<Database>, certId: string) {
  const { data } = await supabase.from('certificates')
    .select('id, project_id, certificate_number, title, issued_by').eq('id', certId).maybeSingle()
  return data as { id: string; project_id: string; certificate_number: string; title: string; issued_by: string | null } | null
}

// ── checkSubsystemEligibility ──────────────────────────────────────────────
// Elegibilidad de subsistema × fase desde SQL certificate_eligibility (= evaluateEligibility, con tests).

export const checkSubsystemEligibility = withAuth(
  {
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'subsystem', field: 'subsystemId', scopeField: 'projectId' },
      { resource: 'phase', field: 'phaseId' },
    ],
  },
  async (
    ctx,
    input: { projectId: string; subsystemId: string; phaseId: string },
  ): Promise<Eligibility & { previousBlocker?: string | null; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const [{ data, error }, { data: prev }] = await Promise.all([
      ctx.supabase.rpc('certificate_eligibility', { p_subsystem_id: input.subsystemId, p_phase_id: input.phaseId }),
      ctx.supabase.rpc('certificate_previous_blocker', { p_subsystem_id: input.subsystemId, p_phase_id: input.phaseId }),
    ])
    if (error || !data) {
      return { eligible: 'red', totalItrs: 0, approvedItrs: 0, openCatA: 0, openCatBPunches: [], catBLimit: null, catBOverLimit: false, error: error?.message ?? t('certificates.noData') }
    }
    return { ...(fromJson<Eligibility>(data)), previousBlocker: prev ?? null }
  },
)

// ── issueCertificate ───────────────────────────────────────────────────────

export const issueCertificate = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'subsystem', field: 'subsystemId', scopeField: 'projectId' },
      { resource: 'phase', field: 'phaseId' },
    ],
  },
  async (
    ctx,
    input: {
      projectId: string
      subsystemId: string
      phaseId: string
      notes?: string
      catBExceptions?: { punchId: string; justification: string }[]
    },
  ): Promise<{ certId?: string; certNumber?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { projectId, subsystemId, phaseId } = input
    const { data: certId, error } = await ctx.supabase.rpc('issue_certificate', {
      p_subsystem_id: subsystemId,
      p_phase_id: phaseId,
      p_notes: optText(input.notes),
      p_exceptions: (input.catBExceptions ?? []).map(e => ({ punch_id: e.punchId, justification: e.justification })),
    })
    if (error || !certId) return { error: error?.message ?? t('certificates.issueFailed') }

    const cert = await certInfo(ctx.supabase, certId)
    if (cert) {
      const recipients = (await certificateSigners(ctx.orgId, projectId)).filter(uid => uid !== ctx.userId)
      await notify(recipients.map(uid => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'cert_signature_requested',
        title: `Firma requerida: ${cert.certificate_number}`,
        body: cert.title,
        link_url: `/projects/${projectId}/certificates/${cert.id}`,
        payload: { certId: cert.id, certNumber: cert.certificate_number, projectId, subsystemId, phaseId },
      })), 'cert_signature_requested')
    }

    revalidatePath(`/projects/${projectId}/certificates`)
    return { certId, certNumber: cert?.certificate_number }
  },
)

// ── addPunchException / removePunchException ───────────────────────────────

export const addPunchException = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: { certificateId: string; punchId: string; justification: string; projectId: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('add_certificate_exception', {
      p_certificate_id: input.certificateId,
      p_punch_id: input.punchId,
      p_justification: input.justification.trim(),
    })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/certificates`)
    return {}
  },
)

export const removePunchException = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: { exceptionId: string; projectId: string; certId: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('remove_certificate_exception', { p_exception_id: input.exceptionId })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return {}
  },
)

// ── revokeCertificate ──────────────────────────────────────────────────────

export const revokeCertificate = withAuth(
  {
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: { certId: string; projectId: string; reason: string },
  ): Promise<{ error?: string; revokedCount?: number }> => {
    const t = await getTranslations('ActionErrors')
    const reason = (input.reason ?? '').trim()
    const cert = await certInfo(ctx.supabase, input.certId)
    if (!cert || cert.project_id !== input.projectId) return { error: t('certificates.notFound') }

    const { data, error } = await ctx.supabase.rpc('revoke_certificate', { p_certificate_id: input.certId, p_reason: reason })
    if (error) return { error: error.message }
    const signers = (data as { userId: string }[] | null) ?? []

    const recipients = Array.from(new Set(signers.map(s => s.userId))).filter(uid => uid && uid !== ctx.userId)
    await notify(recipients.map(uid => ({
      org_id: ctx.orgId,
      recipient_user_id: uid,
      kind: 'certificate_revoked',
      title: `El certificado ${cert.certificate_number} fue revocado`,
      body: reason,
      link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
      payload: { certId: input.certId, projectId: input.projectId, certCode: cert.certificate_number, reason },
    })), 'certificate_revoked')

    revalidatePath(`/projects/${input.projectId}/certificates`)
    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return { revokedCount: signers.length }
  },
)

// ── reopenCertificate ──────────────────────────────────────────────────────

export const reopenCertificate = withAuth(
  {
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: { certId: string; projectId: string; reason: string },
  ): Promise<{ error?: string; notifiedCount?: number }> => {
    const t = await getTranslations('ActionErrors')
    const reason = (input.reason ?? '').trim()
    const cert = await certInfo(ctx.supabase, input.certId)
    if (!cert || cert.project_id !== input.projectId) return { error: t('certificates.notFound') }

    const { error } = await ctx.supabase.rpc('reopen_certificate', { p_certificate_id: input.certId, p_reason: reason })
    if (error) return { error: error.message }

    // Quienes firmaron antes de la revocación: avisarles que deben volver a firmar.
    const { data: lastRevoke } = await ctx.supabase
      .from('activity_log')
      .select('payload')
      .eq('entity_type', 'certificate')
      .eq('entity_id', input.certId)
      .eq('action', 'revoked')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const previous = (lastRevoke?.payload as { previousSignatures?: { userId: string }[] } | null)?.previousSignatures ?? []
    const recipients = Array.from(new Set(previous.map(s => s.userId))).filter(uid => uid && uid !== ctx.userId)
    await notify(recipients.map(uid => ({
      org_id: ctx.orgId,
      recipient_user_id: uid,
      kind: 'certificate_reopened',
      title: `El certificado ${cert.certificate_number} fue reabierto`,
      body: reason,
      link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
      payload: { certId: input.certId, projectId: input.projectId, certCode: cert.certificate_number, reason },
    })), 'certificate_reopened')

    revalidatePath(`/projects/${input.projectId}/certificates`)
    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return { notifiedCount: recipients.length }
  },
)

// ── signCertificate ────────────────────────────────────────────────────────
// Sin role tier: firma quien tenga la capacidad del rol en el proyecto (CERT_ROLE_CAPACITY; la RPC decide).

export const signCertificate = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: {
      certId: string
      role: CertSignRole
      projectId: string
      comments?: string
      signatureImage?: string | null
    },
  ): Promise<{ error?: string }> => {
    const sigImage = optText(input.signatureImage)
    const { data, error } = await ctx.supabase.rpc('sign_certificate', {
      p_certificate_id: input.certId,
      p_role: input.role,
      p_comments: optText(input.comments),
      p_signature_image: sigImage,
    })
    if (error) return { error: error.message }

    // Cierre del ciclo: con la 3.ª firma avisa al emisor, a los firmantes y a los admins.
    if ((data as { fully_signed?: boolean } | null)?.fully_signed) {
      const cert = await certInfo(ctx.supabase, input.certId)
      const admin = createAdminClient()
      const [{ data: sigs }, { data: admins }] = await Promise.all([
        admin.from('certificate_signatures').select('user_id').eq('certificate_id', input.certId),
        admin.from('org_members').select('user_id').eq('org_id', ctx.orgId).eq('status', 'active').in('role', tierRoles('privileged')),
      ])
      const set = new Set<string>([...(sigs ?? []), ...(admins ?? [])].map(r => r.user_id as string).filter(Boolean))
      if (cert?.issued_by) set.add(cert.issued_by)
      set.delete(ctx.userId)
      if (cert) {
        await notify(Array.from(set).map(uid => ({
          org_id: ctx.orgId,
          recipient_user_id: uid,
          kind: 'cert_issued',
          title: `Certificado ${cert.certificate_number} emitido y firmado`,
          body: cert.title,
          link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
          payload: { certId: input.certId, projectId: input.projectId, certNumber: cert.certificate_number },
        })), 'cert_issued')
      }
    }

    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return {}
  },
)

// ── removeCertificateSignature ─────────────────────────────────────────────
// La propia firma o un owner/admin (lo decide unsign_certificate).

export const removeCertificateSignature = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { signatureId: string; certId: string; projectId: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('unsign_certificate', { p_signature_id: input.signatureId })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return {}
  },
)
