import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import AuditLogView from './AuditLogView'

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entityType?: string; userId?: string; from?: string; to?: string }>
}) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  if (!['owner', 'admin'].includes(membership.role)) redirect('/dashboard')

  const orgId = membership.org_id
  const params = await searchParams
  const page = Math.max(0, parseInt(params.page ?? '0', 10))
  const PAGE_SIZE = 50
  const offset = page * PAGE_SIZE

  let query = supabase
    .from('domain_events')
    .select('id, aggregate_type, aggregate_id, event_type, payload, occurred_at, actor_id, profiles:actor_id(full_name)', { count: 'exact' })
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (params.entityType) query = query.eq('aggregate_type', params.entityType)
  if (params.userId) query = query.eq('actor_id', params.userId)
  if (params.from) query = query.gte('occurred_at', params.from)
  if (params.to) query = query.lte('occurred_at', params.to + 'T23:59:59Z')

  const { data: events, count } = await query


  const logs = (events ?? []).map(e => ({
    id: e.id,
    entity_type: e.aggregate_type,
    entity_id: e.aggregate_id,
    action: e.event_type.includes('.') ? e.event_type.split('.').slice(1).join('.') : e.event_type,
    payload: e.payload,
    created_at: e.occurred_at,
    profiles: e.profiles,
  }))

  // Fetch distinct users for filter dropdown
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, profiles(id, full_name)')
    .eq('org_id', orgId)

  const users = (members ?? []).flatMap(m => {
    const p = m.profiles
    return p ? [{ id: p.id, full_name: p.full_name }] : []
  })

  return (
    <AuditLogView
      logs={logs}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      users={users}
      filters={{
        entityType: params.entityType ?? '',
        userId: params.userId ?? '',
        from: params.from ?? '',
        to: params.to ?? '',
      }}
    />
  )
}
