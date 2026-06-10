'use server'

import { withAuthOnly } from '@/lib/auth/withAuth'
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

export const listMyNotifications = withAuthOnly(
  {},
  async (ctx, limit: number = 20): Promise<{
    items?: NotificationRow[]
    unreadCount?: number
    error?: string
  }> => {

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
  },
)

export const fetchMoreNotifications = withAuthOnly(
  {},
  async (
    ctx,
    cursor: string,
    limit: number = 50,
  ): Promise<{ items?: NotificationRow[]; hasMore?: boolean; error?: string }> => {

  const { data } = await ctx.supabase
    .from('notifications')
    .select('id, kind, title, body, link_url, read_at, created_at')
    .eq('recipient_user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

    const rows = (data ?? []) as NotificationRow[]
    const hasMore = rows.length > limit
    return { items: hasMore ? rows.slice(0, limit) : rows, hasMore }
  },
)

export const markNotificationRead = withAuthOnly(
  {},
  async (ctx, id: string): Promise<{ error?: string }> => {

  const { error } = await ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_user_id', ctx.userId)
    .is('read_at', null)

    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return {}
  },
)

export const markAllNotificationsRead = withAuthOnly(
  {},
  async (ctx): Promise<{ error?: string }> => {

  const { error } = await ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .is('read_at', null)

    if (error) return { error: error.message }
    revalidatePath('/', 'layout')
    return {}
  },
)
