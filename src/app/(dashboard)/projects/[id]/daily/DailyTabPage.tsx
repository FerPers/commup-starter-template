import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { ACTION_LIVE, CONSTRAINT_LIVE, TQ_LIVE } from '@/lib/daily/catalog'
import PartialNote from '@/components/ui/PartialNote'
import DailyView, { type ActionRow, type ConstraintRow, type DecisionRow, type DailyTab, type TqRow } from './DailyView'

// Gestión diaria del proyecto (fase 5 plan readiness): acciones, restricciones, TQ y decisiones.
// H-18: cada pestaña es una ruta (`/daily`, `/daily/constraints`, `/daily/tqs`, `/daily/decisions`); se lee solo la
// tabla de la pestaña y, de las demás, el conteo de lo vivo. Lectura por RLS; escritura por RPC (migración 20261017120000).
export default async function DailyTabPage({ projectId, tab }: { projectId: string; tab: DailyTab }) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', projectId).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then(r => r.count ?? 0)
  // S09 (D-24): PostgREST corta en 1000 filas y DailyView calcula los KPI en el cliente; se lee completa con .range().
  const empty = Promise.resolve({ rows: [] as never[], truncated: false })

  const [actionsRes, constraintsRes, tqsRes, decisionsRes, nActions, nConstraints, nTqs, nDecisions, { data: members }] = await Promise.all([
    tab === 'actions' ? fetchAllRowsFlagged(() => supabase.from('actions')
      .select('id, number, title, status, priority, due_date, owner_id, source_kind, source_ref, verification_method, done_by, systems(code)')
      .eq('project_id', projectId).order('seq', { ascending: false })) : empty,
    tab === 'constraints' ? fetchAllRowsFlagged(() => supabase.from('project_constraints')
      .select('id, number, title, status, escalation_level, need_date, owner_id, impact_kind, systems(code), readiness_gates(code)')
      .eq('project_id', projectId).order('seq', { ascending: false })) : empty,
    tab === 'tqs' ? fetchAllRowsFlagged(() => supabase.from('technical_queries')
      .select('id, number, subject, status, addressed_to, addressed_to_name, required_by, responded_at, design_change, systems(code), disciplines(code)')
      .eq('project_id', projectId).order('seq', { ascending: false })) : empty,
    tab === 'decisions' ? fetchAllRowsFlagged(() => supabase.from('decisions')
      .select('id, number, title, status, decided_at, decided_by, source_kind, source_ref, systems(code)')
      .eq('project_id', projectId).order('seq', { ascending: false })) : empty,
    count(supabase.from('actions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ACTION_LIVE)),
    count(supabase.from('project_constraints').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', CONSTRAINT_LIVE)),
    count(supabase.from('technical_queries').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', TQ_LIVE)),
    count(supabase.from('decisions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'active')),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

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
      {truncated && <PartialNote>{tl('listPartial')}</PartialNote>}
      <DailyView
        project={project}
        tab={tab}
        counts={{ actions: nActions, constraints: nConstraints, tqs: nTqs, decisions: nDecisions }}
        actions={actionsRes.rows.map(a => ({ ...a, system: code(a.systems) }) as ActionRow)}
        constraints={constraintsRes.rows.map(c => ({ ...c, system: code(c.systems), gate: code(c.readiness_gates) }) as ConstraintRow)}
        tqs={tqsRes.rows.map(q => ({ ...q, system: code(q.systems), discipline: code(q.disciplines) }) as TqRow)}
        decisions={decisionsRes.rows.map(d => ({ ...d, system: code(d.systems) }) as DecisionRow)}
        names={names}
        userId={ctx.userId}
        canCreate={ctx.role !== 'client'}
        canCreateTq
        canDecide={ROLE_TIERS.editor.includes(ctx.role)}
      />
    </>
  )
}
