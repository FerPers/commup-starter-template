import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import DailyView, { type ActionRow, type ConstraintRow, type DecisionRow, type DailyTab, type TqRow } from './DailyView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

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

  // S09 (D-24): PostgREST corta en 1000 filas y DailyView calcula los KPI (abiertas, vencidas, por verificar…) en el
  // cliente; con .limit(1000) las más viejas —justo las vencidas— desaparecían. Se leen completas con .range().
  const [actionsRes, constraintsRes, tqsRes, decisionsRes, { data: members }] = await Promise.all([
    fetchAllRowsFlagged(() => supabase.from('actions')
      .select('id, number, title, status, priority, due_date, owner_id, source_kind, source_ref, verification_method, done_by, systems(code)')
      .eq('project_id', id).order('seq', { ascending: false })),
    fetchAllRowsFlagged(() => supabase.from('project_constraints')
      .select('id, number, title, status, escalation_level, need_date, owner_id, impact_kind, systems(code), readiness_gates(code)')
      .eq('project_id', id).order('seq', { ascending: false })),
    fetchAllRowsFlagged(() => supabase.from('technical_queries')
      .select('id, number, subject, status, addressed_to, addressed_to_name, required_by, responded_at, design_change, systems(code), disciplines(code)')
      .eq('project_id', id).order('seq', { ascending: false })),
    fetchAllRowsFlagged(() => supabase.from('decisions')
      .select('id, number, title, status, decided_at, decided_by, source_kind, source_ref, systems(code)')
      .eq('project_id', id).order('seq', { ascending: false })),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  const actions = actionsRes.rows
  const constraints = constraintsRes.rows
  const tqs = tqsRes.rows
  const decisions = decisionsRes.rows
  const truncated = actionsRes.truncated || constraintsRes.truncated || tqsRes.truncated || decisionsRes.truncated

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const code = (v: unknown) => (v as { code: string } | null)?.code ?? null

  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <DailyView
      project={project}
      initialTab={TABS.includes(tab as DailyTab) ? (tab as DailyTab) : 'actions'}
      actions={actions.map(a => ({ ...a, system: code(a.systems) }) as unknown as ActionRow)}
      constraints={constraints.map(c => ({ ...c, system: code(c.systems), gate: code(c.readiness_gates) }) as unknown as ConstraintRow)}
      tqs={tqs.map(q => ({ ...q, system: code(q.systems), discipline: code(q.disciplines) }) as unknown as TqRow)}
      decisions={decisions.map(d => ({ ...d, system: code(d.systems) }) as unknown as DecisionRow)}
      names={names}
      userId={ctx.userId}
      canCreate={ctx.role !== 'client'}
      canDecide={ROLE_TIERS.editor.includes(ctx.role)}
    />
    </>
  )
}
