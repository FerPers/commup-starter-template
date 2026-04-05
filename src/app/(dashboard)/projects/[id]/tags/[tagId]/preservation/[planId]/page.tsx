import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PreservationExecution from './PreservationExecution'

export default async function PreservationExecutionPage({
  params,
}: {
  params: Promise<{ id: string; tagId: string; planId: string }>
}) {
  const { id: projectId, tagId, planId } = await params

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

  // Load plan + procedure + items
  const { data: plan } = await supabase
    .from('preservation_plans')
    .select(`
      id, status, start_date, next_due_date, last_performed_date,
      preservation_procedures(
        id, code, title, frequency, interval_days,
        requires_photo, requires_signature,
        disciplines(code, color),
        preservation_procedure_items(
          id, order_index, label, item_type, unit,
          min_value, max_value, is_critical, is_required
        )
      ),
      tags(id, tag_number, description)
    `)
    .eq('id', planId)
    .eq('tag_id', tagId)
    .single()

  if (!plan) notFound()

  // Load existing open record for today (if any) — so user can resume
  const today = new Date().toISOString().split('T')[0]
  const { data: openRecord } = await supabase
    .from('preservation_records')
    .select(`
      id, result, remarks, punch_raised,
      preservation_record_responses(id, item_id, value_bool, value_numeric, value_text, is_passed)
    `)
    .eq('plan_id', planId)
    .gte('performed_at', today + 'T00:00:00')
    .limit(1)
    .maybeSingle()

  // Load recent records (history)
  const { data: history } = await supabase
    .from('preservation_records')
    .select('id, performed_at, result, remarks, punch_raised, performed_by, profiles:performed_by(full_name)')
    .eq('plan_id', planId)
    .order('performed_at', { ascending: false })
    .limit(10)

  // Sort items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = plan.preservation_procedures as any
  const sortedItems = (proc?.preservation_procedure_items ?? [])
    .slice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.order_index - b.order_index)

  return (
    <PreservationExecution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plan={plan as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      procedure={{ ...(proc ?? {}), preservation_procedure_items: sortedItems } as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openRecord={openRecord as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history={(history ?? []) as any}
      projectId={projectId}
      tagId={tagId}
    />
  )
}
