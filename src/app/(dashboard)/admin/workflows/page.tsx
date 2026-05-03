import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import WorkflowsView from './WorkflowsView'

export default async function AdminWorkflowsPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
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
