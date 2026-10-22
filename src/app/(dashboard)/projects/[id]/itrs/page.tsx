import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import ItrListView from './ItrListView'
import AllItrs from '../../../itrs/AllItrs'
import ScopeToggle from '@/components/navigation/ScopeToggle'
import { isScopeAll } from '@/lib/list/scope'
import { fetchItrPage, fetchItrStatusCounts } from '@/lib/list/itr-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'
import { ITR_SORT_KEYS } from '@/lib/list/itr-types'

type Search = { page?: string; sort?: string; dir?: string; status?: string; phase?: string; disc?: string; q?: string; system?: string; subsystem?: string; area?: string; assignee?: string; scope?: string; project?: string }

export default async function ProjectItrsPage({
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
    return <><ScopeToggle projectId={projectId} list="itrs" all /><AllItrs projectId={projectId} sp={sp} /></>
  }

  // Paginación/orden/filtros viven en la URL (Sprint E): el servidor devuelve una página.
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, ITR_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  // S19 (C-30): «míos» = el usuario en sesión.
  const filters = { status: sp.status, phase: sp.phase, disc: sp.disc, q: sp.q, system: sp.system, subsystem: sp.subsystem, area: sp.area,
    assignee: sp.assignee === 'me' ? ctx.userId : sp.assignee }
  const scope = { orgId: ctx.orgId, projectId }

  const [{ data: project }, pageRes, counts, { data: phases }, { data: disciplines }, { data: members }, { data: systems }, { data: subsystems }, { data: areas }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).eq('org_id', ctx.orgId).single(),
    fetchItrPage(supabase, scope, { filters, page, sort, dir }),
    fetchItrStatusCounts(supabase, scope),
    supabase.from('project_phases').select('id, code, name, color, order_index').eq('org_id', ctx.orgId).order('order_index'),
    supabase.from('disciplines').select('code, name, color').eq('org_id', ctx.orgId).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    // bounded: jerarquía de un proyecto (decenas a cientos de filas)
    supabase.from('systems').select('id, code, name, area_id').eq('project_id', projectId).order('code'),
    // bounded: subsistemas de un proyecto
    supabase.from('subsystems').select('id, code, name, system_id').eq('project_id', projectId).order('code'),
    // bounded: áreas de un proyecto
    supabase.from('areas').select('id, code, name').eq('project_id', projectId).order('code'),
  ])

  if (!project) notFound()

  const users = (members ?? [])
    .map(m => ({ user_id: m.user_id, full_name: m.profiles?.full_name ?? '' }))
    .filter(u => u.full_name)

  const tc = await getTranslations('Common')
  return (
    <>
      <ScopeToggle projectId={projectId} list="itrs" all={false} />
      {pageRes.searchCapped && <PartialNote>{tc('searchPartial')}</PartialNote>}
      <ItrListView
        projectId={projectId}
        projectName={project.name}
        rows={pageRes.rows}
        total={pageRes.total}
        page={page}
        pageSize={LIST_PAGE_SIZE}
        counts={counts}
        filters={{ status: sp.status ?? '', phase: sp.phase ?? '', disc: sp.disc ?? '', q: sp.q ?? '', system: sp.system ?? '', subsystem: sp.subsystem ?? '', area: sp.area ?? '', assignee: sp.assignee ?? '' }}
        scopes={{ systems: systems ?? [], subsystems: subsystems ?? [], areas: areas ?? [] }}
        sort={sort}
        dir={dir}
        phases={phases ?? []}
        disciplines={disciplines ?? []}
        users={users}
        userRole={ctx.role}
      />
    </>
  )
}
