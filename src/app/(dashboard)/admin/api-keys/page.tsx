import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import ApiKeysView from './ApiKeysView'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function AdminApiKeysPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  if (!ROLE_TIERS.privileged.includes(membership.role)) redirect('/dashboard')

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  return <ApiKeysView keys={keys ?? []} />
}
