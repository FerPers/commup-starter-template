import type { SupabaseClient } from '@supabase/supabase-js'

type PssrReviewMeta = {
  reviewId: string
  reviewNumber: string
  projectId: string
  systemCode?: string | null
  systemName?: string | null
}

const ADMIN_ROLES = ['owner', 'admin', 'architect', 'leader']

function reviewLink(meta: PssrReviewMeta) {
  return `/projects/${meta.projectId}/pssr/${meta.reviewId}`
}

function systemTag(meta: PssrReviewMeta) {
  if (meta.systemCode || meta.systemName) {
    return `${meta.systemCode ?? ''}${meta.systemCode && meta.systemName ? ' — ' : ''}${meta.systemName ?? ''}`.trim()
  }
  return null
}

async function approverUserIds(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ADMIN_ROLES)
  return (data ?? []).map(m => m.user_id as string).filter(Boolean)
}

async function signerUserIds(admin: SupabaseClient, reviewId: string): Promise<string[]> {
  const { data } = await admin
    .from('pssr_signatures')
    .select('user_id')
    .eq('review_id', reviewId)
  return (data ?? []).map(s => s.user_id as string).filter(Boolean)
}

/**
 * PSSR submitted for approval → notifies leaders/architects/admins/owners.
 * Excludes the submitter.
 */
export async function notifyPssrSubmittedForApproval(
  admin: SupabaseClient,
  params: { orgId: string; submitterUserId: string } & PssrReviewMeta,
): Promise<void> {
  const approvers = await approverUserIds(admin, params.orgId)
  const recipients = approvers.filter(uid => uid !== params.submitterUserId)
  if (recipients.length === 0) return

  const sysTag = systemTag(params)
  const rows = recipients.map(uid => ({
    org_id: params.orgId,
    recipient_user_id: uid,
    kind: 'pssr_submitted_for_approval',
    title: `PSSR ${params.reviewNumber} enviado para aprobación`,
    body: sysTag ? `Sistema: ${sysTag}` : null,
    link_url: reviewLink(params),
    payload: {
      reviewId: params.reviewId,
      reviewNumber: params.reviewNumber,
      projectId: params.projectId,
      systemCode: params.systemCode ?? null,
      systemName: params.systemName ?? null,
    },
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('[notifications.insert pssr_submitted_for_approval]', error)
}

/**
 * PSSR approved → notifies creator + signers + admins (RFSU issued).
 * Excludes the approver.
 */
export async function notifyPssrApproved(
  admin: SupabaseClient,
  params: {
    orgId: string
    approverUserId: string
    createdBy: string | null
    rfsuCertNumber: string
    rfsuCertId: string
  } & PssrReviewMeta,
): Promise<void> {
  const [admins, signers] = await Promise.all([
    approverUserIds(admin, params.orgId),
    signerUserIds(admin, params.reviewId),
  ])

  const set = new Set<string>()
  if (params.createdBy) set.add(params.createdBy)
  signers.forEach(uid => set.add(uid))
  admins.forEach(uid => set.add(uid))
  set.delete(params.approverUserId)

  const recipients = Array.from(set)
  if (recipients.length === 0) return

  const sysTag = systemTag(params)
  const body = sysTag
    ? `Sistema: ${sysTag} · Certificado ${params.rfsuCertNumber} emitido`
    : `Certificado ${params.rfsuCertNumber} emitido`

  const rows = recipients.map(uid => ({
    org_id: params.orgId,
    recipient_user_id: uid,
    kind: 'pssr_approved',
    title: `PSSR ${params.reviewNumber} aprobado — RFSU ${params.rfsuCertNumber}`,
    body,
    link_url: reviewLink(params),
    payload: {
      reviewId: params.reviewId,
      reviewNumber: params.reviewNumber,
      projectId: params.projectId,
      systemCode: params.systemCode ?? null,
      systemName: params.systemName ?? null,
      rfsuCertId: params.rfsuCertId,
      rfsuCertNumber: params.rfsuCertNumber,
    },
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('[notifications.insert pssr_approved]', error)
}

/**
 * PSSR rejected → notifies creator + signers (so they can address findings).
 * Excludes the rejector.
 */
export async function notifyPssrRejected(
  admin: SupabaseClient,
  params: {
    orgId: string
    rejecterUserId: string
    createdBy: string | null
    reason?: string | null
  } & PssrReviewMeta,
): Promise<void> {
  const signers = await signerUserIds(admin, params.reviewId)

  const set = new Set<string>()
  if (params.createdBy) set.add(params.createdBy)
  signers.forEach(uid => set.add(uid))
  set.delete(params.rejecterUserId)

  const recipients = Array.from(set)
  if (recipients.length === 0) return

  const sysTag = systemTag(params)
  const body = [
    sysTag ? `Sistema: ${sysTag}` : null,
    params.reason ? `Motivo: ${params.reason}` : null,
  ].filter(Boolean).join(' · ') || null

  const rows = recipients.map(uid => ({
    org_id: params.orgId,
    recipient_user_id: uid,
    kind: 'pssr_rejected',
    title: `PSSR ${params.reviewNumber} rechazado`,
    body,
    link_url: reviewLink(params),
    payload: {
      reviewId: params.reviewId,
      reviewNumber: params.reviewNumber,
      projectId: params.projectId,
      systemCode: params.systemCode ?? null,
      systemName: params.systemName ?? null,
      reason: params.reason ?? null,
    },
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('[notifications.insert pssr_rejected]', error)
}
