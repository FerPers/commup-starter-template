import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ItrListGlobal from './ItrListGlobal'

export default async function GlobalItrsPage() {
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

  const [{ data: projects }, { data: itrs }, { data: phases }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('itrs')
      .select(`
        id, itr_number, status, progress_pct, scheduled_date, created_at, project_id,
        projects(id, name, code),
        itr_templates(code, title, disciplines(code, name, color)),
        tags(id, tag_number, description),
        project_phases(code, name, color),
        itr_assignments(user_id, role, profiles(full_name)),
        itr_signatures(role, signed_at)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  return (
    <ItrListGlobal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itrs={(itrs ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phases={(phases ?? []) as any}
    />
  )
}
