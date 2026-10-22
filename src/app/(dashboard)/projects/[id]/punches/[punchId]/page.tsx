import { getActiveMembership } from '@/lib/supabase/membership'
import RememberRecent from '@/components/layout/RememberRecent'
import { redirect, notFound } from 'next/navigation'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { buildPunchTimeline } from '@/lib/punches/timeline'
import PunchDetail, { type PunchDetailData } from './PunchDetail'

// N1b (H-03/H-14): página propia del punch. Los avisos, Mi trabajo, la lista y la ficha del tag
// abren aquí en vez de una lista sin filtrar o un modal sin dirección.

export default async function PunchPage({ params }: { params: Promise<{ id: string; punchId: string }> }) {
  const { id: projectId, punchId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  // activity_log: por RLS solo lo leen owner/admin (reasignaciones); para el resto ni se consulta.
  const readsAudit = ROLE_TIERS.admin.includes(ctx.role)

  const [{ data: project }, { data: punch }, { data: comments }, { data: activity }, { data: orgMembers }] = await Promise.all([
    supabase.from('projects').select('id, code, name, timezone').eq('id', projectId).eq('org_id', ctx.orgId).maybeSingle(),
    supabase
      .from('punches')
      .select(`
        id, punch_number, category, description, status, priority, target_date, closed_date, created_at,
        itr_id, assigned_to, raised_by, resolved_at, resolved_by, impact, startup_disposition, category_reviewed_at,
        raised_by_profile:profiles!raised_by(full_name),
        resolved_by_profile:profiles!resolved_by(full_name),
        assigned_to_profile:profiles!assigned_to(full_name),
        disciplines(code, name, color),
        tags(id, tag_number, description),
        subsystems(id, code, name, systems(id, code, name)),
        itrs(id, itr_number, tag_id),
        itr_template_items(item_number, description, description_es)
      `)
      .eq('id', punchId)
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase.from('punch_comments').select('id, user_id, comment, created_at, profiles(full_name)')
      .eq('punch_id', punchId).order('created_at').limit(500),
    readsAudit
      ? supabase.from('activity_log').select('id, user_id, action, payload, created_at')
          .eq('entity_type', 'punch').eq('entity_id', punchId).eq('action', 'reassigned')
          .order('created_at').limit(200)
      : Promise.resolve({ data: [] as Array<{ id: string; user_id: string; action: string; payload: unknown; created_at: string }> }),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId).order('role'),
  ])

  if (!project || !punch) notFound()

  // Nombres: miembros + autores de comentarios + los de la fila (alguien que ya salió de la org sigue con nombre).
  const names: Record<string, string> = {}
  for (const m of orgMembers ?? []) if (m.profiles?.full_name) names[m.user_id] = m.profiles.full_name
  for (const c of comments ?? []) if (c.profiles?.full_name) names[c.user_id] = c.profiles.full_name
  if (punch.raised_by && punch.raised_by_profile?.full_name) names[punch.raised_by] = punch.raised_by_profile.full_name
  if (punch.resolved_by && punch.resolved_by_profile?.full_name) names[punch.resolved_by] = punch.resolved_by_profile.full_name
  if (punch.assigned_to && punch.assigned_to_profile?.full_name) names[punch.assigned_to] = punch.assigned_to_profile.full_name
  const missing = [...new Set((activity ?? []).flatMap(a => {
    const p = (a.payload ?? {}) as Record<string, unknown>
    return [a.user_id, p.from, p.to].filter((v): v is string => typeof v === 'string' && !names[v])
  }))]
  if (missing.length) {
    const { data: extra } = await supabase.from('profiles').select('id, full_name').in('id', missing)
    for (const p of extra ?? []) if (p.full_name) names[p.id] = p.full_name
  }

  const timeline = buildPunchTimeline({ punch, comments: comments ?? [], activity: activity ?? [] })

  const data: PunchDetailData = {
    id: punch.id,
    punch_number: punch.punch_number,
    category: punch.category,
    description: punch.description,
    status: punch.status,
    priority: punch.priority,
    target_date: punch.target_date,
    closed_date: punch.closed_date,
    created_at: punch.created_at,
    itr_id: punch.itr_id,
    assigned_to: punch.assigned_to,
    raised_by: punch.raised_by,
    resolved_at: punch.resolved_at,
    resolved_by: punch.resolved_by,
    resolved_by_name: punch.resolved_by_profile?.full_name ?? null,
    impact: punch.impact,
    startup_disposition: punch.startup_disposition,
    category_reviewed_at: punch.category_reviewed_at,
    discipline: punch.disciplines ?? null,
    tag: punch.tags ?? null,
    subsystem: punch.subsystems ? { code: punch.subsystems.code, name: punch.subsystems.name, system: punch.subsystems.systems ?? null } : null,
    itr: punch.itrs ?? null,
    itrItem: punch.itr_template_items ?? null,
  }

  return (
    <>
    <RememberRecent kind="punch" code={punch.punch_number} title={punch.description} href={`/projects/${projectId}/punches/${punch.id}`} projectCode={project.code} />
    <PunchDetail
      punch={data}
      projectId={projectId}
      projectName={project.name}
      timezone={project.timezone}
      timeline={timeline}
      names={names}
      orgMembers={orgMembers ?? []}
      userId={ctx.userId}
      role={ctx.role}
    />
    </>
  )
}
