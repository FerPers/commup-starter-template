import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import WebhooksView from './WebhooksView'

export default async function AdminWebhooksPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  if (!['owner', 'admin', 'architect'].includes(membership.role)) redirect('/dashboard')

  const [{ data: subs }, { data: projects }] = await Promise.all([
    supabase
      .from('webhook_subscriptions')
      .select('id, name, endpoint_url, project_id, event_types, enabled, created_at, last_success_at, last_error_at, failure_count')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, name')
      .eq('org_id', membership.org_id)
      .order('name'),
  ])

  const subIds = (subs ?? []).map(s => s.id)
  let deliveries: {
    id: string
    subscription_id: string
    domain_event_id: string
    status: string
    attempts: number
    next_retry_at: string
    last_response_code: number | null
    delivered_at: string | null
    created_at: string
  }[] = []

  if (subIds.length > 0) {
    const { data } = await supabase
      .from('webhook_deliveries')
      .select('id, subscription_id, domain_event_id, status, attempts, next_retry_at, last_response_code, delivered_at, created_at')
      .in('subscription_id', subIds)
      .order('created_at', { ascending: false })
      .limit(300)
    deliveries = data ?? []
  }

  return (
    <WebhooksView
      subs={subs ?? []}
      projects={projects ?? []}
      deliveries={deliveries}
    />
  )
}
