'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'

// ── inviteUser ─────────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function inviteUser(input: {
  email: string
  role: string
}): Promise<{ error?: string; tempPassword?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos para invitar usuarios' }

  const { email, role } = input
  if (role === 'owner' && ctx.role !== 'owner') {
    return { error: 'Solo un owner puede invitar a otro owner' }
  }
  const admin = createAdminClient()

  // Check if user already exists in auth
  const { data: existingList } = await admin.auth.admin.listUsers()
  const existingUser = existingList?.users.find(u => u.email === email)

  if (existingUser) {
    const { data: existingMember } = await ctx.supabase
      .from('org_members')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (existingMember) return { error: 'Este usuario ya es miembro de la organización' }

    const { error } = await ctx.supabase
      .from('org_members')
      .insert({ org_id: ctx.orgId, user_id: existingUser.id, role })

    if (error) return { error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId,
      entityType: 'user', entityId: existingUser.id,
      action: 'invited', payload: { email, role },
    })

    revalidatePath('/admin/users')
    return {}
  }

  // New user — try email invitation first
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { org_id: ctx.orgId, invited_role: role },
  })

  if (!inviteErr && invited?.user) {
    const { error: profileErr } = await admin.from('profiles').upsert(
      { id: invited.user.id, email, full_name: email.split('@')[0] },
      { onConflict: 'id' }
    )
    if (profileErr) {
      return { error: `Usuario invitado pero perfil no se pudo crear: ${profileErr.message}` }
    }

    // Surfacing this error matters: prior versions silently dropped it, leaving
    // auth users without a membership row (orphans visible in admin/users only
    // by the "pending confirmation" badge).
    const { error: memberErr } = await admin
      .from('org_members')
      .insert({ org_id: ctx.orgId, user_id: invited.user.id, role })
    if (memberErr) {
      return { error: `Usuario invitado pero no se pudo agregar a la organización: ${memberErr.message}` }
    }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId,
      entityType: 'user', entityId: invited.user.id,
      action: 'invited', payload: { email, role },
    })

    revalidatePath('/admin/users')
    return {}
  }

  // Email invite failed (email provider not configured) — create with temp password
  const tempPassword = generateTempPassword()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (createErr) return { error: createErr.message }
  if (!created?.user) return { error: 'Error al crear usuario' }

  await admin.from('profiles').upsert(
    { id: created.user.id, email, full_name: email.split('@')[0] },
    { onConflict: 'id' }
  )
  const { error: memberErr } = await admin
    .from('org_members')
    .insert({ org_id: ctx.orgId, user_id: created.user.id, role })

  if (memberErr) return { error: memberErr.message }

  await logActivity(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    entityType: 'user', entityId: created.user.id,
    action: 'invited', payload: { email, role },
  })

  revalidatePath('/admin/users')
  return { tempPassword }
}

// ── updateMemberRole ───────────────────────────────────────────────────────

export async function updateMemberRole(input: {
  memberId: string
  role: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos para cambiar roles' }

  const { data: member } = await ctx.supabase
    .from('org_members')
    .select('user_id, role')
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!member) return { error: 'Miembro no encontrado' }

  // Only owners can mutate owner rows (admins cannot demote/promote owners).
  if (member.role === 'owner' && ctx.role !== 'owner') {
    return { error: 'Solo un owner puede cambiar el rol de otro owner' }
  }
  if (input.role === 'owner' && ctx.role !== 'owner') {
    return { error: 'Solo un owner puede asignar el rol de owner' }
  }

  if (member.user_id === ctx.userId && member.role === 'owner' && input.role !== 'owner') {
    return { error: 'No puedes cambiar tu propio rol de owner' }
  }

  // Last-owner protection: never let the org end up with zero owners.
  if (member.role === 'owner' && input.role !== 'owner') {
    const { count } = await ctx.supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .eq('role', 'owner')
    if ((count ?? 0) <= 1) {
      return { error: 'No puedes degradar al último owner de la organización' }
    }
  }

  const { error } = await ctx.supabase
    .from('org_members')
    .update({ role: input.role })
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  await logActivity(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    entityType: 'user', entityId: member.user_id,
    action: 'role_updated', payload: { memberId: input.memberId, newRole: input.role },
  })

  revalidatePath('/admin/users')
  return {}
}

// ── removeMember ───────────────────────────────────────────────────────────

export async function removeMember(input: {
  memberId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos para remover miembros' }

  const { data: member } = await ctx.supabase
    .from('org_members')
    .select('user_id, role')
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!member) return { error: 'Miembro no encontrado' }
  if (member.user_id === ctx.userId) return { error: 'No puedes removerte a ti mismo' }

  if (member.role === 'owner') {
    if (ctx.role !== 'owner') return { error: 'Solo un owner puede remover a otro owner' }
    const { count } = await ctx.supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .eq('role', 'owner')
    if ((count ?? 0) <= 1) {
      return { error: 'No puedes remover al último owner de la organización' }
    }
  }

  const { error } = await ctx.supabase
    .from('org_members')
    .delete()
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  await logActivity(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    entityType: 'user', entityId: member.user_id,
    action: 'removed', payload: { memberId: input.memberId },
  })

  revalidatePath('/admin/users')
  return {}
}
