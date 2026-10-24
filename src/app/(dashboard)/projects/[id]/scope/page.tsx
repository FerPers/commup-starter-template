import { notFound, redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { formatInZone } from '@/lib/time/zone'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import ScopeView, { type ScopeEvent, type ScopeRow } from './ScopeView'
import ClientCodesPanel, { type ClientCodeTemplate } from './ClientCodesPanel'

// R1 (maquetas M, 2026-10-22): alcance de disciplinas del proyecto. Todos los miembros lo ven; lo cambian
// Propietario, Administrador y Arquitecto (la RPC set_project_disciplines lo vuelve a exigir).
export default async function ScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: scope, error }, { data: events }, locale, { data: tpls }, { data: phases }, { data: codes }] = await Promise.all([
    supabase.rpc('project_discipline_scope', { p_project_id: id }),
    // bounded: historial reciente del alcance
    supabase.from('project_discipline_events')
      .select('id, action, reason, itrs_affected, user_id, created_at, disciplines(code, name)')
      .eq('project_id', id).order('created_at', { ascending: false }).limit(30),
    getLocale(),
    // bounded: plantillas activas de la org (R2b, códigos del cliente; ~300 en el catálogo, se toma la última versión)
    supabase.from('itr_templates').select('code, title, title_es, discipline_id, phase_id, version')
      .eq('org_id', ctx.orgId).eq('is_active', true).order('code').order('version', { ascending: false }).limit(3000),
    // bounded: fases de la org (decenas)
    supabase.from('project_phases').select('id, code').eq('org_id', ctx.orgId),
    // bounded: un código por plantilla y nivel (defecto de la org + este proyecto)
    supabase.from('template_client_codes').select('template_code, client_code, project_id')
      .eq('org_id', ctx.orgId).or(`project_id.is.null,project_id.eq.${id}`).limit(5000),
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
    const d = e.disciplines
    return {
      id: e.id, action: e.action as ScopeEvent['action'], reason: e.reason, itrs: e.itrs_affected,
      discipline: d ? `${d.code} · ${d.name}` : '—', who: (e.user_id && nameOf.get(e.user_id)) ?? '', at: formatInZone(e.created_at, project.timezone, locale),
    }
  })

  // R2b: códigos del cliente de las plantillas de las disciplinas del alcance.
  const inScope = new Map((scope ?? []).filter(r => r.included).map(r => [r.discipline_id, r.name]))
  const phaseCode = new Map((phases ?? []).map(p => [p.id, p.code]))
  const orgCode = new Map((codes ?? []).filter(c => !c.project_id).map(c => [c.template_code, c.client_code]))
  const projectCode = new Map((codes ?? []).filter(c => c.project_id).map(c => [c.template_code, c.client_code]))
  const seen = new Set<string>()
  const clientTemplates: ClientCodeTemplate[] = []
  for (const x of tpls ?? []) {
    const key = x.code.toUpperCase()
    if (seen.has(key) || !x.discipline_id || !inScope.has(x.discipline_id)) continue
    seen.add(key)
    clientTemplates.push({
      code: key, title: x.title_es?.trim() ? x.title_es.trim() : x.title, discipline: inScope.get(x.discipline_id) ?? '—',
      phase: x.phase_id ? phaseCode.get(x.phase_id) ?? null : null, org: orgCode.get(key) ?? null, project: projectCode.get(key) ?? null,
    })
  }

  return (
    <>
    <ScopeView
      projectId={project.id}
      projectCode={project.code}
      rows={rows}
      history={history}
      canEdit={ROLE_TIERS.privileged.includes(ctx.role)}
    />
    <ClientCodesPanel projectId={project.id} templates={clientTemplates} canEdit={ROLE_TIERS.privileged.includes(ctx.role)} />
    </>
  )
}
