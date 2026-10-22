import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { denyAccess } from '@/lib/auth/denied'
import WorkflowsView from './WorkflowsView'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function AdminWorkflowsPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  if (!ROLE_TIERS.privileged.includes(membership.role)) denyAccess('privileged')

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
