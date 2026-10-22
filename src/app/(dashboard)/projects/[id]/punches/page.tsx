import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import PunchListView from './PunchListView'
import AllPunches from '../../../punch-list/AllPunches'
import ScopeToggle from '@/components/navigation/ScopeToggle'
import { isScopeAll } from '@/lib/list/scope'
import ClientPunchSummary from './ClientPunchSummary'
import { fetchPunchPage, fetchPunchSummary, PUNCH_SORT_KEYS } from '@/lib/list/punch-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'

type Search = { page?: string; sort?: string; dir?: string; cat?: string; status?: string; disc?: string; system?: string; q?: string; view?: string; scope?: string; project?: string; assigned?: string }

export default async function PunchListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const { id: projectId } = await params
  const sp = await searchParams

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  // N2c: alcance «Todos los proyectos» (antes la página global); el id del proyecto solo da el contexto del menú.
  if (isScopeAll(sp.scope)) {
    const { data: inOrg } = await supabase.from('projects').select('id').eq('id', projectId).eq('org_id', ctx.orgId).maybeSingle()
    if (!inOrg) notFound()
    return <><ScopeToggle projectId={projectId} list="punches" all /><AllPunches projectId={projectId} sp={sp} /></>
  }

  // Sprint E: página/filtros en la URL; el servidor devuelve 50 filas + conteos en SQL.
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, PUNCH_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  const filters = { cat: sp.cat, status: sp.status, disc: sp.disc, system: sp.system, q: sp.q }
  const scope = { orgId: ctx.orgId, projectId }

  // N1: el cliente entra por el resumen por categoría; elegir una (o «ver todos») abre la lista.
  const anyFilter = [sp.cat, sp.status, sp.disc, sp.system, sp.q, sp.page].some(Boolean) || sp.view === 'list'
  if (ctx.role === 'client' && !anyFilter) {
    const [{ data: proj }, summary] = await Promise.all([
      supabase.from('projects').select('id, name').eq('id', projectId).eq('org_id', ctx.orgId).single(),
      fetchPunchSummary(supabase, scope),
    ])
    if (!proj) notFound()
    return <ClientPunchSummary projectId={projectId} projectName={proj.name} summary={summary} />
  }

  const [
    { data: project },
    pageRes,
    summary,
    { data: disciplines },
    { data: systems },
    { data: orgMembers },
  ] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).eq('org_id', ctx.orgId).single(),
    fetchPunchPage(supabase, scope, { filters, page, sort, dir }),
    fetchPunchSummary(supabase, scope),
    supabase.from('disciplines').select('id, code, name, color').eq('org_id', ctx.orgId).order('code'),
    supabase.from('systems').select('id, code, name').eq('project_id', projectId).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId).order('role'),
  ])

  if (!project) notFound()


  const tc = await getTranslations('Common')
  return (
    <>
      <ScopeToggle projectId={projectId} list="punches" all={false} />
      {pageRes.searchCapped && <PartialNote>{tc('searchPartial')}</PartialNote>}
      <PunchListView
        projectId={projectId}
        projectName={project.name}
        currentUserRole={ctx.role}
        punches={pageRes.rows}
        total={pageRes.total}
        page={page}
        pageSize={LIST_PAGE_SIZE}
        summary={summary}
        filters={{ cat: sp.cat ?? '', status: sp.status ?? '', disc: sp.disc ?? '', system: sp.system ?? '', q: sp.q ?? '' }}
        disciplines={disciplines ?? []}
        systems={systems ?? []}
        orgMembers={orgMembers ?? []}
      />
    </>
  )
}
