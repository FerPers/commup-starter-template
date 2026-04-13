import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditLogView from './AuditLogView'

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entityType?: string; userId?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')
  if (!['owner', 'admin'].includes(membership.role)) redirect('/dashboard')

  const orgId = membership.org_id
  const params = await searchParams
  const page = Math.max(0, parseInt(params.page ?? '0', 10))
  const PAGE_SIZE = 50
  const offset = page * PAGE_SIZE

  let query = supabase
    .from('activity_log')
    .select('*, profiles(full_name)', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (params.entityType) query = query.eq('entity_type', params.entityType)
  if (params.userId) query = query.eq('user_id', params.userId)
  if (params.from) query = query.gte('created_at', params.from)
  if (params.to) query = query.lte('created_at', params.to + 'T23:59:59Z')

  const { data: logs, count } = await query

  // Fetch distinct users for filter dropdown
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, profiles(id, full_name)')
    .eq('org_id', orgId)

  const users = (members ?? []).flatMap(m => {
    const p = m.profiles as unknown as { id: string; full_name: string } | null
    return p ? [{ id: p.id, full_name: p.full_name }] : []
  })

  return (
    <AuditLogView
      logs={logs ?? []}
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
