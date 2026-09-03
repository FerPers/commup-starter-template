import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ItrListView from './ItrListView'
import { fetchItrPage, fetchItrStatusCounts } from '@/lib/list/itr-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'
import { ITR_SORT_KEYS } from '@/lib/list/itr-types'

type Search = { page?: string; sort?: string; dir?: string; status?: string; phase?: string; disc?: string; q?: string }

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

  // Paginación/orden/filtros viven en la URL (Sprint E): el servidor devuelve una página.
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, ITR_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  const filters = { status: sp.status, phase: sp.phase, disc: sp.disc, q: sp.q }
  const scope = { orgId: ctx.orgId, projectId }

  const [{ data: project }, pageRes, counts, { data: phases }, { data: disciplines }, { data: members }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).eq('org_id', ctx.orgId).single(),
    fetchItrPage(supabase, scope, { filters, page, sort, dir }),
    fetchItrStatusCounts(supabase, scope),
    supabase.from('project_phases').select('id, code, name, color, order_index').eq('org_id', ctx.orgId).order('order_index'),
    supabase.from('disciplines').select('code, name, color').eq('org_id', ctx.orgId).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  if (!project) notFound()

  const users = (members ?? [])
    .map(m => ({ user_id: m.user_id, full_name: m.profiles?.full_name ?? '' }))
    .filter(u => u.full_name)

  return (
    <ItrListView
      projectId={projectId}
      projectName={project.name}
      rows={pageRes.rows}
      total={pageRes.total}
      page={page}
      pageSize={LIST_PAGE_SIZE}
      counts={counts}
      filters={{ status: sp.status ?? '', phase: sp.phase ?? '', disc: sp.disc ?? '', q: sp.q ?? '' }}
      sort={sort}
      dir={dir}
      phases={phases ?? []}
      disciplines={disciplines ?? []}
      users={users}
      userRole={ctx.role}
    />
  )
}
