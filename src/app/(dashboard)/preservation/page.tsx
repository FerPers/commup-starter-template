import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PreservationGlobal from './PreservationGlobal'

export default async function GlobalPreservationPage() {
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

  const [{ data: projects }, { data: plans }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('preservation_plans')
      .select(`
        id, status, start_date, next_due_date, last_performed_date, project_id,
        projects(id, name, code),
        tags(id, tag_number, description),
        preservation_procedures(id, code, title, frequency, interval_days)
      `)
      .order('next_due_date', { ascending: true }),
  ])

  return (
    <PreservationGlobal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plans={(plans ?? []) as any}
    />
  )
}
