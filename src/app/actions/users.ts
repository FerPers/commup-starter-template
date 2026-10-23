'use server'

import type { OrgMemberRole } from '@/types/database'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

// ── inviteUser ─────────────────────────────────────────────────────────────

const INVITABLE_ROLES: OrgMemberRole[] = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client']

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://commup.app'

/* Mensaje único de invitación (users.inviteSent): no revela si el correo ya tenía cuenta en CommUp (A-21). */

/**
 * S15 (A-21/I-21): cuenta existente → invitación pendiente que la persona acepta (status 'invited'); cuenta nueva →
 * correo de Supabase y membresía activa (aceptar = fijar su contraseña). Email sin mayúsculas; la búsqueda es una RPC
 * sobre auth.users (antes se listaban 1000 usuarios). Vencimiento opcional del acceso (contratistas, vendors).
 */
export const inviteUser = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { email: string; role: string; expiresAt?: string | null },
  ): Promise<{ error?: string; message?: string }> => {
  const t = await getTranslations('ActionErrors')
  const email = (input.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t('users.invalidEmail') }
  const role = input.role as OrgMemberRole
  if (!INVITABLE_ROLES.includes(role)) return { error: t('users.invalidRole') }
  if (role === 'owner' && ctx.role !== 'owner') {
    return { error: t('users.ownerInvitesOwner') }
  }
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null
  const admin = createAdminClient()

  const { data: existingId, error: lookupErr } = await admin.rpc('auth_user_id_by_email', { p_email: email })
  if (lookupErr) return { error: t('users.inviteFailed') }

  if (existingId) {
    const { error } = await ctx.supabase.rpc('add_org_member', {
      p_org_id: ctx.orgId, p_user_id: existingId as string, p_role: role, p_status: 'invited',
      ...(expiresAt ? { p_expires_at: expiresAt } : {}),
    })
    // Ya miembro o invitación pendiente: se informa igual que un envío para no revelar cuentas.
    if (error && error.code !== '23505') return { error: error.message }
    revalidatePath('/admin/users')
    return { message: t('users.inviteSent') }
  }

  // Cuenta nueva: invitación por correo (el enlace fija la contraseña).
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { org_id: ctx.orgId, invited_role: role },
    redirectTo: `${SITE_URL}/auth/set-password`,
  })
  if (inviteErr || !invited?.user) {
    // Sin fallback de contraseña temporal (Sprint S): el SMTP está configurado
    // y una clave generada en servidor y mostrada en pantalla es un riesgo.
    return { error: t('users.inviteEmailFailed', { detail: inviteErr?.message ?? t('users.unknownError') }) }
  }
  const { error: profileErr } = await admin.from('profiles').upsert(
    { id: invited.user.id, full_name: email.split('@')[0] },
    { onConflict: 'id' }
  )
  if (profileErr) return { error: t('users.profileFailed', { detail: profileErr.message }) }
  const { error: memberErr } = await ctx.supabase.rpc('add_org_member', {
    p_org_id: ctx.orgId, p_user_id: invited.user.id, p_role: role, p_status: 'active',
    ...(expiresAt ? { p_expires_at: expiresAt } : {}),
  })
  if (memberErr) return { error: t('users.memberFailed', { detail: memberErr.message }) }
  revalidatePath('/admin/users')
  return { message: t('users.inviteSent') }
  },
)

// ── updateMemberRole ───────────────────────────────────────────────────────

export const updateMemberRole = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { memberId: string; role: OrgMemberRole },
  ): Promise<{ error?: string }> => {
  const t = await getTranslations('ActionErrors')
  // S15 (A-02/I-12): las reglas de owner y de último owner viven en la RPC set_member_role.
  const { data: member } = await ctx.supabase.from('org_members').select('id').eq('id', input.memberId).eq('org_id', ctx.orgId).maybeSingle()
  if (!member) return { error: t('users.memberNotFound') }
  const { error } = await ctx.supabase.rpc('set_member_role', { p_member_id: input.memberId, p_role: input.role })
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return {}
  },
)

/** S15 (I-21): suspender / reactivar y fijar o quitar el vencimiento del acceso. */
export const setMemberAccess = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { memberId: string; status: 'active' | 'suspended'; expiresAt?: string | null; reason?: string },
  ): Promise<{ error?: string }> => {
  const t = await getTranslations('ActionErrors')
  if (input.status !== 'active' && input.status !== 'suspended') return { error: t('users.invalidStatus') }
  const { data: member } = await ctx.supabase.from('org_members').select('id').eq('id', input.memberId).eq('org_id', ctx.orgId).maybeSingle()
  if (!member) return { error: t('users.memberNotFound') }
  const reason = (input.reason ?? '').trim().slice(0, 500)
  const { error } = await ctx.supabase.rpc('set_member_access', {
    p_member_id: input.memberId, p_status: input.status,
    ...(input.expiresAt ? { p_expires_at: new Date(input.expiresAt).toISOString() } : {}),
    ...(reason ? { p_reason: reason } : {}),
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return {}
  },
)

// ── removeMember ───────────────────────────────────────────────────────────

// ── getMemberRemovalContext ────────────────────────────────────────────────
// Qué deja atrás un miembro si se le quita la membresía. Su perfil, firmas y
// punches NUNCA se borran (FKs NO ACTION a profiles): esto solo informa al admin
// para que reasigne el trabajo abierto antes de removerlo.

export type MemberRemovalContext = {
  openPunches: number
  openItrAssignments: number
  signatures: number
  punchesRaised: number
}

export const getMemberRemovalContext = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { memberId: string },
  ): Promise<{ data?: MemberRemovalContext; error?: string }> => {
  const t = await getTranslations('ActionErrors')
  const { data: member } = await ctx.supabase
    .from('org_members')
    .select('user_id')
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)
    .single()
  if (!member) return { error: t('users.memberNotFound') }
  const uid = member.user_id

  const [openPunches, openItrs, signatures, raised] = await Promise.all([
    ctx.supabase
      .from('punches')
      .select('id, projects!inner(org_id)', { count: 'exact', head: true })
      .eq('projects.org_id', ctx.orgId)
      .eq('assigned_to', uid)
      .in('status', ['open', 'in_progress']),
    ctx.supabase
      .from('itr_assignments')
      .select('id, itrs!inner(status, projects!inner(org_id))', { count: 'exact', head: true })
      .eq('itrs.projects.org_id', ctx.orgId)
      .eq('user_id', uid)
      .in('itrs.status', ['not_started', 'in_progress']),
    ctx.supabase
      .from('itr_signatures')
      .select('id, itrs!inner(projects!inner(org_id))', { count: 'exact', head: true })
      .eq('itrs.projects.org_id', ctx.orgId)
      .eq('user_id', uid),
    ctx.supabase
      .from('punches')
      .select('id, projects!inner(org_id)', { count: 'exact', head: true })
      .eq('projects.org_id', ctx.orgId)
      .eq('raised_by', uid),
  ])
  const firstErr = [openPunches, openItrs, signatures, raised].find(r => r.error)?.error
  if (firstErr) return { error: firstErr.message }

  return {
    data: {
      openPunches: openPunches.count ?? 0,
      openItrAssignments: openItrs.count ?? 0,
      signatures: signatures.count ?? 0,
      punchesRaised: raised.count ?? 0,
    },
  }
})

export const removeMember = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { memberId: string },
  ): Promise<{ error?: string }> => {
  const t = await getTranslations('ActionErrors')
  // S15 (A-02/I-12): reglas (no a sí mismo, solo owner quita owner, nunca sin owner activo) en la RPC.
  const { data: member } = await ctx.supabase.from('org_members').select('id').eq('id', input.memberId).eq('org_id', ctx.orgId).maybeSingle()
  if (!member) return { error: t('users.memberNotFound') }
  const { error } = await ctx.supabase.rpc('remove_org_member', { p_member_id: input.memberId })
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return {}
  },
)
