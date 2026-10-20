import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { buildDailyWorkbook } from '@/lib/excel/daily'
import { fetchAllRows, TruncatedError } from '@/lib/list/fetch-all'

export const dynamic = 'force-dynamic'

// Excel de la gestión diaria (fase 5): acciones, restricciones, TQ y decisiones del proyecto.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: project } = await supabase.from('projects').select('id, code').eq('id', id).eq('org_id', orgId).single()
  if (!project) return new Response('Project not found', { status: 404 })

  // S09 (D-24): PostgREST corta en 1000 filas aunque se pida .limit(5000); se pagina con .range() y, si se supera
  // el tope, se responde 413 en vez de entregar un Excel incompleto.
  let lists
  try {
    lists = await Promise.all([
      fetchAllRows(() => supabase.from('actions').select('id, number, title, status, priority, owner_id, due_date, source_kind, source_ref, verification_method, closure_note, done_at, verified_at, systems(code)')
        .eq('project_id', id).order('seq')),
      fetchAllRows(() => supabase.from('project_constraints').select('id, number, title, description, status, escalation_level, owner_id, need_date, impact_kind, impact, recovery_plan, resolution_note, systems(code), readiness_gates(code)')
        .eq('project_id', id).order('seq')),
      fetchAllRows(() => supabase.from('technical_queries').select('id, number, subject, question, status, addressed_to, addressed_to_name, required_by, response, responded_by_name, responded_at, design_change, moc_ref, systems(code), disciplines(code)')
        .eq('project_id', id).order('seq')),
      fetchAllRows(() => supabase.from('decisions').select('id, number, title, decision, rationale, status, decided_at, decided_by, attendees, source_kind, source_ref, systems(code)')
        .eq('project_id', id).order('seq')),
    ])
  } catch (err) {
    if (err instanceof TruncatedError) return new Response(err.message, { status: 413 })
    throw err
  }
  const [actions, constraints, tqs, decisions] = lists
  const { data: members } = await supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', orgId)

  const t = await getTranslations('Daily')
  const names = new Map<string, string>()
  for (const m of members ?? []) names.set(m.user_id, (m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? '')
  const who = (uid: string | null) => (uid ? names.get(uid) ?? '' : '')
  const code = (v: unknown) => (v as { code: string } | null)?.code ?? ''
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

  const bytes = buildDailyWorkbook([
    {
      name: t('tab.actions'),
      headers: [t('col.number'), t('col.title'), t('col.status'), t('col.priority'), t('col.owner'), t('col.due'), t('col.source'),
        t('field.sourceRef'), t('col.system'), t('field.verificationMethod'), t('status.action.done'), t('status.action.verified')],
      rows: actions.map(a => [a.number, a.title, t(`status.action.${a.status}`), t(`priority.${a.priority}`), who(a.owner_id), a.due_date,
        t(`source.${a.source_kind}`), a.source_ref, code(a.systems), t(`method.${a.verification_method}`), day(a.done_at), day(a.verified_at)]),
    },
    {
      name: t('tab.constraints'),
      headers: [t('col.number'), t('col.title'), t('field.constraintDescription'), t('col.status'), t('col.level'), t('col.system'), t('col.gate'),
        t('col.owner'), t('col.needDate'), t('field.impactKind'), t('field.impact'), t('field.recoveryPlan')],
      rows: constraints.map(c => [c.number, c.title, c.description, t(`status.constraint.${c.status}`), c.escalation_level, code(c.systems),
        code(c.readiness_gates), who(c.owner_id), c.need_date, t(`impact.${c.impact_kind}`), c.impact, c.recovery_plan]),
    },
    {
      name: t('tab.tqs'),
      headers: [t('col.number'), t('col.subject'), t('field.question'), t('col.status'), t('col.addressedTo'), t('field.addressedToName'),
        t('col.discipline'), t('col.system'), t('col.requiredBy'), t('tq.response'), t('tq.respondedByName'), t('tq.designChange'), t('tq.mocRef')],
      rows: tqs.map(x => [x.number, x.subject, x.question, t(`status.tq.${x.status}`), t(`addressee.${x.addressed_to}`), x.addressed_to_name,
        code(x.disciplines), code(x.systems), x.required_by, x.response, x.responded_by_name, x.design_change ? '✓' : '', x.moc_ref]),
    },
    {
      name: t('tab.decisions'),
      headers: [t('col.number'), t('col.title'), t('field.decision'), t('field.rationale'), t('col.status'), t('col.decidedAt'), t('col.decidedBy'),
        t('field.attendees'), t('col.source'), t('field.sourceRef'), t('col.system')],
      rows: decisions.map(d => [d.number, d.title, d.decision, d.rationale, t(`status.decision.${d.status}`), d.decided_at, who(d.decided_by),
        d.attendees, t(`decisionSource.${d.source_kind}`), d.source_ref, code(d.systems)]),
    },
  ])

  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename = `${safeCode}-gestion-diaria-${new Date().toISOString().slice(0, 10)}.xlsx`
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
