import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import ItrListGlobal from './ItrListGlobal'
import { fetchItrPage, fetchItrStatusCounts } from '@/lib/list/itr-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'
import { ITR_SORT_KEYS } from '@/lib/list/itr-types'

type Search = { page?: string; sort?: string; dir?: string; status?: string; phase?: string; disc?: string; q?: string; project?: string }

export default async function GlobalItrsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, ITR_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  const filters = { status: sp.status, phase: sp.phase, disc: sp.disc, q: sp.q, project: sp.project }
  const scope = { orgId: ctx.orgId }

  const [{ data: projects }, pageRes, counts, { data: phases }, { data: disciplines }] = await Promise.all([
    supabase.from('projects').select('id, name, code').eq('org_id', ctx.orgId).order('name'),
    fetchItrPage(supabase, scope, { filters, page, sort, dir }),
    fetchItrStatusCounts(supabase, scope),
    supabase.from('project_phases').select('id, code, name, color, order_index').eq('org_id', ctx.orgId).order('order_index'),
    supabase.from('disciplines').select('code, name, color').eq('org_id', ctx.orgId).order('code'),
  ])

  return (
    <ItrListGlobal
      projects={projects ?? []}
      rows={pageRes.rows}
      total={pageRes.total}
      page={page}
      pageSize={LIST_PAGE_SIZE}
      counts={counts}
      filters={{ status: sp.status ?? '', phase: sp.phase ?? '', disc: sp.disc ?? '', q: sp.q ?? '', project: sp.project ?? '' }}
      sort={sort}
      dir={dir}
      phases={phases ?? []}
      disciplines={disciplines ?? []}
    />
  )
}
