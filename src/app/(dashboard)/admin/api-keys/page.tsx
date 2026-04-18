import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApiKeysView from './ApiKeysView'

export default async function AdminApiKeysPage() {
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
  if (!['owner', 'admin', 'architect'].includes(membership.role)) redirect('/dashboard')

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  return <ApiKeysView keys={keys ?? []} />
}
