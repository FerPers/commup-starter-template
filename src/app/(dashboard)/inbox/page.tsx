import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import InboxList from './InboxList'
import type { NotificationRow } from '@/app/actions/notifications'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function InboxPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const [{ data: raw }, { count }] = await Promise.all([
    ctx.supabase
      .from('notifications')
      .select('id, kind, title, body, link_url, read_at, created_at')
      .eq('recipient_user_id', ctx.userId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1),
    ctx.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', ctx.userId)
      .eq('org_id', ctx.orgId),
  ])

  const rows = (raw ?? []) as NotificationRow[]
  const hasMore = rows.length > PAGE_SIZE
  const initialItems = hasMore ? rows.slice(0, PAGE_SIZE) : rows

  return (
    <InboxList
      initialItems={initialItems}
      initialHasMore={hasMore}
      totalCount={count ?? 0}
    />
  )
}
