'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_ORG_COOKIE, isActiveMembership } from '@/lib/supabase/membership'

// Manual a propósito (caso especial del plan wrapper): verifica membership en la
// org DESTINO, no en la activa — getActiveMembership/withAuth no aplican aquí.
export async function switchOrg(targetOrgId: string): Promise<{ error?: string }> {
  const t = await getTranslations('ActionErrors')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('auth.unauthenticated') }

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, status, access_expires_at')
    .eq('user_id', user.id)
    .eq('org_id', targetOrgId)
    .maybeSingle()

  // S15 (I-21): el usuario ve también sus membresías invitadas o suspendidas; solo se entra a una activa.
  if (!m || !isActiveMembership(m)) return { error: t('org.notActiveMember') }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, targetOrgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  return {}
}

/**
 * S15 (I-21): la persona invitada acepta o rechaza una invitación pendiente. Manual a propósito, como switchOrg:
 * todavía no es miembro activo de esa org, así que withAuth no aplica; la RPC respond_org_invitation exige que la
 * invitación sea de quien llama.
 */
export async function respondInvitation(orgId: string, accept: boolean): Promise<{ error?: string }> {
  const t = await getTranslations('ActionErrors')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('auth.unauthenticated') }
  const { error } = await supabase.rpc('respond_org_invitation', { p_org_id: orgId, p_accept: accept })
  if (error) return { error: error.message }
  if (accept) {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365,
    })
  }
  revalidatePath('/', 'layout')
  return {}
}
