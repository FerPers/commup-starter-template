import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import NotificationsList from './NotificationsList'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const { data: items } = await ctx.supabase
    .from('notifications')
    .select('id, kind, title, body, link_url, read_at, created_at')
    .eq('recipient_user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <NotificationsList
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialItems={(items ?? []) as any}
    />
  )
}
