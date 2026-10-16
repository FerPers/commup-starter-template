import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import DailyView, { type ActionRow, type ConstraintRow, type DecisionRow, type DailyTab, type TqRow } from './DailyView'

// Gestión diaria del proyecto (fase 5 plan readiness, sesión 1): acciones, restricciones, TQ y
// decisiones en un hub con pestañas. Lectura por RLS; escritura por las RPC de la migración 20261017120000.
const TABS: DailyTab[] = ['actions', 'constraints', 'tqs', 'decisions']

export default async function DailyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: actions }, { data: constraints }, { data: tqs }, { data: decisions }, { data: members }] = await Promise.all([
    supabase.from('actions')
      .select('id, number, title, status, priority, due_date, owner_id, source_kind, source_ref, verification_method, done_by, systems(code)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('project_constraints')
      .select('id, number, title, status, escalation_level, need_date, owner_id, impact_kind, systems(code), readiness_gates(code)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('technical_queries')
      .select('id, number, subject, status, addressed_to, addressed_to_name, required_by, responded_at, design_change, systems(code), disciplines(code)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('decisions')
      .select('id, number, title, status, decided_at, decided_by, source_kind, source_ref, systems(code)')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const code = (v: unknown) => (v as { code: string } | null)?.code ?? null

  return (
    <DailyView
      project={project}
      initialTab={TABS.includes(tab as DailyTab) ? (tab as DailyTab) : 'actions'}
      actions={(actions ?? []).map(a => ({ ...a, system: code(a.systems) }) as unknown as ActionRow)}
      constraints={(constraints ?? []).map(c => ({ ...c, system: code(c.systems), gate: code(c.readiness_gates) }) as unknown as ConstraintRow)}
      tqs={(tqs ?? []).map(q => ({ ...q, system: code(q.systems), discipline: code(q.disciplines) }) as unknown as TqRow)}
      decisions={(decisions ?? []).map(d => ({ ...d, system: code(d.systems) }) as unknown as DecisionRow)}
      names={names}
      userId={ctx.userId}
      canCreate={ctx.role !== 'client'}
    />
  )
}
