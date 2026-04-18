import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsView from './NotificationsView'

export const metadata = { title: 'Notificaciones — CommUp' }

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, topics, enabled, failure_count, last_success_at, device_info, created_at')
    .order('created_at', { ascending: false })

  return <NotificationsView userId={user.id} subscriptions={subs ?? []} />
}
