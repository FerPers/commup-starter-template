'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const ADMIN_ROLES = ['owner', 'admin']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

// ── inviteUser ─────────────────────────────────────────────────────────────

export async function inviteUser(input: {
  email: string
  role: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos para invitar usuarios' }

  const { email, role } = input
  const admin = createAdminClient()

  // Check if user already exists in auth
  const { data: existingList } = await admin.auth.admin.listUsers()
  const existingUser = existingList?.users.find(u => u.email === email)

  if (existingUser) {
    // User already exists in auth — check if already in this org
    const { data: existingMember } = await ctx.supabase
      .from('org_members')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (existingMember) return { error: 'Este usuario ya es miembro de la organización' }

    // Add directly to org
    const { error } = await ctx.supabase
      .from('org_members')
      .insert({ org_id: ctx.orgId, user_id: existingUser.id, role })

    if (error) return { error: error.message }
  } else {
    // New user — send invitation email
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { org_id: ctx.orgId, invited_role: role },
    })

    if (inviteErr) return { error: inviteErr.message }
    if (!invited?.user) return { error: 'Error al crear usuario invitado' }

    // Create profile row
    await admin.from('profiles').upsert({
      id: invited.user.id,
      email,
      full_name: email.split('@')[0],
    }, { onConflict: 'id' })

    // Add to org
    const { error: memberErr } = await admin
      .from('org_members')
      .insert({ org_id: ctx.orgId, user_id: invited.user.id, role })

    if (memberErr) return { error: memberErr.message }
  }

  revalidatePath('/admin/users')
  return {}
}

// ── updateMemberRole ───────────────────────────────────────────────────────

export async function updateMemberRole(input: {
  memberId: string
  role: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos para cambiar roles' }

  // Prevent self-demotion of owner
  const { data: member } = await ctx.supabase
    .from('org_members')
    .select('user_id, role')
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!member) return { error: 'Miembro no encontrado' }
  if (member.user_id === ctx.userId && member.role === 'owner') {
    return { error: 'No puedes cambiar tu propio rol de owner' }
  }

  const { error } = await ctx.supabase
    .from('org_members')
    .update({ role: input.role })
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

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
  if (member.role === 'owner') return { error: 'No se puede remover al owner' }

  const { error } = await ctx.supabase
    .from('org_members')
    .delete()
    .eq('id', input.memberId)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return {}
}
