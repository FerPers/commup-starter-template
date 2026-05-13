'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'

export type NotificationRow = {
  id: string
  kind: string
  title: string
  body: string | null
  link_url: string | null
  read_at: string | null
  created_at: string
}

export async function listMyNotifications(limit = 20): Promise<{
  items: NotificationRow[]
  unreadCount: number
}> {
  const ctx = await getCtx()
  if (!ctx) return { items: [], unreadCount: 0 }

  const [{ data: items }, { count }] = await Promise.all([
    ctx.supabase
      .from('notifications')
      .select('id, kind, title, body, link_url, read_at, created_at')
      .eq('recipient_user_id', ctx.userId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(limit),
    ctx.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', ctx.userId)
      .eq('org_id', ctx.orgId)
      .is('read_at', null),
  ])

  return {
    items: (items ?? []) as NotificationRow[],
    unreadCount: count ?? 0,
  }
}

export async function markNotificationRead(id: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_user_id', ctx.userId)
    .is('read_at', null)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .is('read_at', null)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
