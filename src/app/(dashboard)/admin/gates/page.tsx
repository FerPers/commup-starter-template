import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import GatesAdminView from './GatesAdminView'
import GateWeightsCard from './GateWeightsCard'

// Configuración de gates / hold points de la org (fase 1 plan readiness).
export default async function AdminGatesPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!ADMIN_ROLES.includes(ctx.role)) redirect('/dashboard')
  const supabase = ctx.supabase

  const [{ data: gates }, { data: criteria }, { data: phases }] = await Promise.all([
    supabase
      .from('readiness_gates')
      .select('id, code, name, description, order_index, phase_id, requires_previous, is_active, approval_roles, required_signatures, cosign_roles, weight, requires_lineup, requires_performance')
      .eq('org_id', ctx.orgId)
      .order('order_index')
      .order('code'),
    supabase
      .from('gate_criteria')
      .select('id, gate_id, kind, params, is_blocking, order_index')
      .eq('org_id', ctx.orgId)
      .order('order_index'),
    supabase
      .from('project_phases')
      .select('id, code, name, certificate_name')
      .eq('org_id', ctx.orgId)
      .order('order_index'),
  ])

  return (
    <GatesAdminView
      gates={gates ?? []}
      criteria={(criteria ?? []).map(c => ({ ...c, label: (c.params as { label?: string } | null)?.label ?? null }))}
      phases={phases ?? []}
      weights={<GateWeightsCard gates={(gates ?? []).map(g => ({ ...g, weight: g.weight === null ? null : Number(g.weight) }))} />}
    />
  )
}
