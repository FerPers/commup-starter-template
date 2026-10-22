import { notFound, redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { formatInZone } from '@/lib/time/zone'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import ScopeView, { type ScopeEvent, type ScopeRow } from './ScopeView'

// R1 (maquetas M, 2026-10-22): alcance de disciplinas del proyecto. Todos los miembros lo ven; lo cambian
// Propietario, Administrador y Arquitecto (la RPC set_project_disciplines lo vuelve a exigir).
export default async function ScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: scope, error }, { data: events }, locale] = await Promise.all([
    supabase.rpc('project_discipline_scope', { p_project_id: id }),
    // bounded: historial reciente del alcance
    supabase.from('project_discipline_events')
      .select('id, action, reason, itrs_affected, user_id, created_at, disciplines(code, name)')
      .eq('project_id', id).order('created_at', { ascending: false }).limit(30),
    getLocale(),
  ])
  if (error) throw new Error(error.message)

  const userIds = [...new Set((events ?? []).map(e => e.user_id).filter((u): u is string => !!u))]
  const { data: people } = userIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameOf = new Map((people ?? []).map(p => [p.id, p.full_name ?? '']))

  const rows: ScopeRow[] = (scope ?? []).map(r => ({
    id: r.discipline_id, code: r.code, name: r.name, color: r.color, included: r.included, requirements: r.requirements, itrs: r.itrs,
  }))
  const history: ScopeEvent[] = (events ?? []).map(e => {
    const d = e.disciplines as unknown as { code: string; name: string } | null
    return {
      id: e.id, action: e.action as ScopeEvent['action'], reason: e.reason, itrs: e.itrs_affected,
      discipline: d ? `${d.code} · ${d.name}` : '—', who: (e.user_id && nameOf.get(e.user_id)) ?? '', at: formatInZone(e.created_at, project.timezone, locale),
    }
  })

  return (
    <ScopeView
      projectId={project.id}
      projectCode={project.code}
      rows={rows}
      history={history}
      canEdit={ROLE_TIERS.privileged.includes(ctx.role)}
    />
  )
}
