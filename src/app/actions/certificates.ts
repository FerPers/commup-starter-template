'use server'

import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  acceptedExceptions,
  buildCertificateNumber,
  evaluateEligibility,
  issuanceBlocker,
  type Eligibility,
} from '@/lib/certificates/eligibility'

// ── Eligibility (shared core) ──────────────────────────────────────────────
// Reglas puras en src/lib/certificates/eligibility.ts (con tests); aquí solo se consultan los datos.

async function computeEligibility(
  supabase: SupabaseClient,
  input: { projectId: string; subsystemId: string; phaseId: string },
): Promise<Eligibility> {
  const [{ data: itrs }, { data: punches }] = await Promise.all([
    supabase
      .from('itrs')
      .select('id, status')
      .eq('project_id', input.projectId)
      .eq('subsystem_id', input.subsystemId)
      .eq('phase_id', input.phaseId),
    supabase
      .from('punches')
      .select('id, punch_number, description, category, status')
      .eq('project_id', input.projectId)
      .eq('subsystem_id', input.subsystemId)
      .not('status', 'in', '(closed,cancelled)'),
  ])

  return evaluateEligibility(itrs ?? [], punches ?? [])
}

// ── checkSubsystemEligibility ──────────────────────────────────────────────
// Returns eligibility for a subsystem+phase pair.

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
  ): Promise<Eligibility & { error?: string }> => {
    return computeEligibility(ctx.supabase, input)
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
    const { supabase, userId } = ctx
    const { projectId, subsystemId, phaseId } = input

    // Verify eligibility (Cat A abiertos, ITRs pendientes, Cat B sin justificar)
    const el = await computeEligibility(supabase, { projectId, subsystemId, phaseId })
    const exceptions = input.catBExceptions ?? []
    const blocker = issuanceBlocker(el, exceptions)
    if (blocker) return { error: blocker }

    // Fetch subsystem + phase info
    const [{ data: subsystem }, { data: phase }] = await Promise.all([
      supabase.from('subsystems').select('id, code, name').eq('id', subsystemId).single(),
      supabase.from('project_phases').select('id, code, name, certificate_name').eq('id', phaseId).single(),
    ])
    if (!subsystem || !phase) return { error: 'Subsistema o fase no encontrados' }

    const certType = phase.certificate_name ?? phase.code
    const { count } = await supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .like('certificate_number', `${certType}/${subsystem.code}%`)

    const certNumber = buildCertificateNumber(certType, subsystem.code, count ?? 0)
    const title = `${certType} — ${subsystem.code}: ${subsystem.name}`

    const { data: cert, error: certErr } = await supabase
      .from('certificates')
      .insert({
        project_id: projectId,
        subsystem_id: subsystemId,
        phase_id: phaseId,
        certificate_number: certNumber,
        title,
        status: 'issued',
        issued_date: new Date().toISOString().split('T')[0],
        issued_by: userId,
        notes: input.notes ?? null,
      } as never)
      .select('id, certificate_number')
      .single()

    if (certErr) return { error: certErr.message }

    // Insert Cat B exceptions
    const validExceptions = acceptedExceptions(el, exceptions)
    if (validExceptions.length > 0) {
      await supabase.from('certificate_punch_exceptions').insert(
        validExceptions.map(e => ({
          certificate_id: cert.id,
          punch_id: e.punchId,
          justification: e.justification,
          approved_by: userId,
        })) as never[]
      )
    }

    await logActivity(supabase, {
      orgId: ctx.orgId,
      userId,
      entityType: 'certificate',
      entityId: cert.id,
      action: 'issued',
      payload: {
        certNumber: cert.certificate_number,
        subsystemId,
        phaseId,
        catBExceptions: validExceptions.length,
      },
    })

    // Notify potential signers (owner / admin / architect of the org) that a
    // certificate needs their signature. Issuer is excluded.
    const admin = createAdminClient()
    const { data: signers } = await admin
      .from('org_members')
      .select('user_id')
      .eq('org_id', ctx.orgId)
      .in('role', ['owner', 'admin', 'architect'])

    const recipients = (signers ?? [])
      .map(s => s.user_id)
      .filter(uid => uid && uid !== userId)

    if (recipients.length > 0) {
      const rows = recipients.map(uid => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'cert_signature_requested',
        title: `Firma requerida: ${cert.certificate_number}`,
        body: title,
        link_url: `/projects/${projectId}/certificates/${cert.id}`,
        payload: {
          certId: cert.id,
          certNumber: cert.certificate_number,
          projectId,
          subsystemId,
          phaseId,
        },
      }))
      const { error: notifErr } = await admin.from('notifications').insert(rows)
      if (notifErr) console.error('[notifications.insert]', notifErr)
    }

    revalidatePath(`/projects/${projectId}/certificates`)
    return { certId: cert.id, certNumber: cert.certificate_number }
  },
)

// ── addPunchException ──────────────────────────────────────────────────────

export const addPunchException = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      certificateId: string
      punchId: string
      justification: string
      projectId: string
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('certificate_punch_exceptions')
      .insert({
        certificate_id: input.certificateId,
        punch_id: input.punchId,
        justification: input.justification.trim(),
        approved_by: ctx.userId,
      } as never)

    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/certificates`)
    return {}
  },
)

// ── removePunchException ───────────────────────────────────────────────────

export const removePunchException = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: { exceptionId: string; projectId: string; certId: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('certificate_punch_exceptions')
      .delete()
      .eq('id', input.exceptionId)

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
    const reason = (input.reason ?? '').trim()
    if (reason.length < 3) {
      return { error: 'Debes indicar un motivo (al menos 3 caracteres)' }
    }

    const { supabase } = ctx

    const { data: cert } = await supabase
      .from('certificates')
      .select('id, certificate_number, status, project_id')
      .eq('id', input.certId)
      .single()

    if (!cert) return { error: 'Certificado no encontrado' }
    if (cert.project_id !== input.projectId) return { error: 'Certificado no pertenece al proyecto' }
    if (cert.status !== 'issued') {
      return { error: 'Solo se pueden revocar certificados emitidos' }
    }

    // Snapshot signatures before delete
    const { data: signatures } = await supabase
      .from('certificate_signatures')
      .select('id, user_id, role, signed_at')
      .eq('certificate_id', input.certId)

    const signers = (signatures ?? []) as Array<{ id: string; user_id: string; role: string; signed_at: string }>

    // Drop signatures so cert can be re-issued cleanly
    const { error: delErr } = await supabase
      .from('certificate_signatures')
      .delete()
      .eq('certificate_id', input.certId)
    if (delErr) return { error: delErr.message }

    const { error: updErr } = await supabase
      .from('certificates')
      .update({ status: 'rejected' })
      .eq('id', input.certId)
    if (updErr) return { error: updErr.message }

    await logActivity(supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      entityType: 'certificate',
      entityId: input.certId,
      action: 'revoked',
      payload: {
        projectId: input.projectId,
        reason,
        previousSignatures: signers.map(s => ({
          userId: s.user_id,
          role: s.role,
          signedAt: s.signed_at,
        })),
      },
    })

    const uniqueRecipients = Array.from(new Set(signers.map(s => s.user_id))).filter(
      uid => uid && uid !== ctx.userId,
    )
    if (uniqueRecipients.length > 0) {
      const rows = uniqueRecipients.map(uid => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'certificate_revoked',
        title: `El certificado ${cert.certificate_number} fue revocado`,
        body: reason,
        link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
        payload: { certId: input.certId, projectId: input.projectId, certCode: cert.certificate_number, reason },
      }))
      const admin = createAdminClient()
      const { error: notifErr } = await admin.from('notifications').insert(rows)
      if (notifErr) console.error('[notifications.insert]', notifErr)
    }

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
    const reason = (input.reason ?? '').trim()
    if (reason.length < 3) {
      return { error: 'Debes indicar un motivo (al menos 3 caracteres)' }
    }

    const { supabase } = ctx

    const { data: cert } = await supabase
      .from('certificates')
      .select('id, certificate_number, status, project_id')
      .eq('id', input.certId)
      .single()

    if (!cert) return { error: 'Certificado no encontrado' }
    if (cert.project_id !== input.projectId) return { error: 'Certificado no pertenece al proyecto' }
    if (cert.status !== 'rejected') {
      return { error: 'Solo se pueden reabrir certificados rechazados' }
    }

    const { data: lastRevoke } = await supabase
      .from('activity_log')
      .select('payload')
      .eq('entity_type', 'certificate')
      .eq('entity_id', input.certId)
      .eq('action', 'revoked')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    type PrevSigner = { userId: string; role: string; signedAt: string }
    const previousSignatures = (lastRevoke?.payload as { previousSignatures?: PrevSigner[] } | null)?.previousSignatures ?? []

    const { error: updErr } = await supabase
      .from('certificates')
      .update({ status: 'issued' })
      .eq('id', input.certId)
    if (updErr) return { error: updErr.message }

    await logActivity(supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      entityType: 'certificate',
      entityId: input.certId,
      action: 'reopened',
      payload: {
        projectId: input.projectId,
        reason,
        previousSignatures,
      },
    })

    const uniqueRecipients = Array.from(new Set(previousSignatures.map(s => s.userId))).filter(
      uid => uid && uid !== ctx.userId,
    )
    let notifiedCount = 0
    if (uniqueRecipients.length > 0) {
      const rows = uniqueRecipients.map(uid => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'certificate_reopened',
        title: `El certificado ${cert.certificate_number} fue reabierto`,
        body: reason,
        link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
        payload: { certId: input.certId, projectId: input.projectId, certCode: cert.certificate_number, reason },
      }))
      const admin = createAdminClient()
      const { error: notifErr } = await admin.from('notifications').insert(rows)
      if (notifErr) console.error('[notifications.insert]', notifErr)
      else notifiedCount = uniqueRecipients.length
    }

    revalidatePath(`/projects/${input.projectId}/certificates`)
    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return { notifiedCount }
  },
)

// ── signCertificate ────────────────────────────────────────────────────────

export const signCertificate = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    input: {
      certId: string
      role: 'completion' | 'client' | 'authority'
      projectId: string
      comments?: string
      signatureImage?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { supabase, userId } = ctx

    // Cap signature payload at ~256 KB to avoid abuse (canvas PNG ~5-20 KB typical).
    const sigImage = input.signatureImage?.trim() ?? null
    if (sigImage) {
      if (!sigImage.startsWith('data:image/')) return { error: 'Firma inválida' }
      if (sigImage.length > 256 * 1024) return { error: 'La firma excede el tamaño permitido' }
    }

    const { data: existing } = await supabase
      .from('certificate_signatures')
      .select('id')
      .eq('certificate_id', input.certId)
      .eq('role', input.role)
      .maybeSingle()

    if (existing) return { error: `Ya existe una firma para el rol ${input.role}` }

    const { error } = await supabase
      .from('certificate_signatures')
      .insert({
        certificate_id: input.certId,
        user_id: userId,
        role: input.role,
        comments: input.comments?.trim() ?? null,
        signature_image: sigImage,
      } as never)

    if (error) return { error: error.message }

    await logActivity(supabase, {
      orgId: ctx.orgId,
      userId,
      entityType: 'certificate',
      entityId: input.certId,
      action: 'signed',
      payload: { role: input.role, projectId: input.projectId },
    })

    // Cycle close: if this was the 3rd signature (completion + client + authority),
    // fire a separate `cert_issued` event so issuer + signers + admins see it.
    const { data: allSigs } = await supabase
      .from('certificate_signatures')
      .select('user_id, role')
      .eq('certificate_id', input.certId)

    const signerUserIds = (allSigs ?? []).map(s => s.user_id as string).filter(Boolean)
    if (signerUserIds.length >= 3) {
      const { data: cert } = await supabase
        .from('certificates')
        .select('certificate_number, title, issued_by')
        .eq('id', input.certId)
        .single()

      await logActivity(supabase, {
        orgId: ctx.orgId,
        userId,
        entityType: 'certificate',
        entityId: input.certId,
        action: 'fully_signed',
        payload: { projectId: input.projectId, certNumber: cert?.certificate_number ?? null },
      })

      const admin = createAdminClient()
      const { data: admins } = await admin
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.orgId)
        .in('role', ['owner', 'admin', 'architect'])

      const recipientSet = new Set<string>()
      if (cert?.issued_by) recipientSet.add(cert.issued_by as string)
      signerUserIds.forEach(uid => recipientSet.add(uid))
      ;(admins ?? []).forEach(a => { if (a.user_id) recipientSet.add(a.user_id as string) })
      recipientSet.delete(userId)

      const recipients = Array.from(recipientSet)
      if (recipients.length > 0 && cert) {
        const rows = recipients.map(uid => ({
          org_id: ctx.orgId,
          recipient_user_id: uid,
          kind: 'cert_issued',
          title: `Certificado ${cert.certificate_number} emitido y firmado`,
          body: cert.title,
          link_url: `/projects/${input.projectId}/certificates/${input.certId}`,
          payload: {
            certId: input.certId,
            projectId: input.projectId,
            certNumber: cert.certificate_number,
          },
        }))
        const { error: notifErr } = await admin.from('notifications').insert(rows)
        if (notifErr) console.error('[notifications.insert cert_issued]', notifErr)
      }
    }

    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return {}
  },
)

// ── removeCertificateSignature ─────────────────────────────────────────────

// Sin role tier: la autorización es por identidad (firmante) o admin — se
// resuelve dentro del handler, no con un *_ROLES.
export const removeCertificateSignature = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { signatureId: string; certId: string; projectId: string },
  ): Promise<{ error?: string }> => {
    const { supabase, userId } = ctx

    const { data: sig } = await supabase
      .from('certificate_signatures')
      .select('user_id, role')
      .eq('id', input.signatureId)
      .maybeSingle()

    if (!sig) return { error: 'Firma no encontrada' }

    const isOwner = sig.user_id === userId
    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin'
    if (!isOwner && !isAdmin) return { error: 'Solo el firmante o un admin puede quitar la firma' }

    const { error } = await supabase
      .from('certificate_signatures')
      .delete()
      .eq('id', input.signatureId)

    if (error) return { error: error.message }

    await logActivity(supabase, {
      orgId: ctx.orgId,
      userId,
      entityType: 'certificate',
      entityId: input.certId,
      action: 'unsigned',
      payload: { role: sig.role, projectId: input.projectId },
    })

    revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
    return {}
  },
)
