import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WorkflowsView from './WorkflowsView'

export default async function AdminWorkflowsPage() {
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

  const { data: rules } = await supabase
    .from('workflow_rules')
    .select('id, name, description, trigger_event, condition_jsonlogic, action_type, action_payload, priority, enabled, updated_at')
    .eq('org_id', membership.org_id)
    .order('trigger_event')
    .order('priority')

  const { data: recentExecutions } = await supabase
    .from('workflow_executions')
    .select('id, rule_id, matched, action_result, error_message, executed_at')
    .eq('org_id', membership.org_id)
    .order('executed_at', { ascending: false })
    .limit(50)

  return (
    <WorkflowsView
      rules={rules ?? []}
      recentExecutions={recentExecutions ?? []}
    />
  )
}
