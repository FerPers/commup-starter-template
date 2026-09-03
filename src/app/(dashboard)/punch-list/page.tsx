import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PunchListGlobal from './PunchListGlobal'
import { fetchPunchPage, fetchPunchSummary, PUNCH_SORT_KEYS } from '@/lib/list/punch-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'

type Search = { page?: string; sort?: string; dir?: string; cat?: string; status?: string; disc?: string; q?: string; project?: string }

export default async function GlobalPunchListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, PUNCH_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  const filters = { cat: sp.cat, status: sp.status, disc: sp.disc, q: sp.q, project: sp.project }
  const scope = { orgId: ctx.orgId }

  const [{ data: projects }, pageRes, summary, { data: disciplines }, { data: orgMembers }] = await Promise.all([
    supabase.from('projects').select('id, name, code').eq('org_id', ctx.orgId).order('name'),
    fetchPunchPage(supabase, scope, { filters, page, sort, dir }),
    fetchPunchSummary(supabase, scope),
    supabase.from('disciplines').select('id, code, name, color').eq('org_id', ctx.orgId).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId).order('role'),
  ])

  const punches = pageRes.rows.map(r => ({
    id: r.id,
    punch_number: r.punch_number,
    category: r.category,
    description: r.description,
    status: r.status,
    priority: r.priority,
    target_date: r.target_date,
    closed_date: r.closed_date,
    created_at: r.created_at,
    itr_id: r.itr_id,
    project_id: r.project_id,
    assigned_to: r.assigned_to,
    raised_by_profile: r.raised_by_name ? { full_name: r.raised_by_name } : null,
    assigned_to_profile: r.assigned_to_name ? { full_name: r.assigned_to_name } : null,
    projects: { id: r.project_id, name: r.project_name, code: r.project_code },
    tags: r.tag_id
      ? {
          id: r.tag_id,
          tag_number: r.tag_number ?? '',
          description: r.tag_description ?? '',
          disciplines: { code: r.discipline_code ?? '', name: r.discipline_name ?? '', color: r.discipline_color ?? '#64748b' },
        }
      : null,
    subsystems: {
      id: r.subsystem_id,
      code: r.subsystem_code ?? '',
      name: r.subsystem_name ?? '',
      systems: { code: r.system_code ?? '', name: r.system_name ?? '' },
    },
  }))

  return (
    <PunchListGlobal
      currentUserRole={ctx.role}
      projects={projects ?? []}
      punches={punches}
      total={pageRes.total}
      page={page}
      pageSize={LIST_PAGE_SIZE}
      summary={summary}
      filters={{ project: sp.project ?? '', cat: sp.cat ?? '', status: sp.status ?? '', disc: sp.disc ?? '', q: sp.q ?? '' }}
      disciplines={disciplines ?? []}
      orgMembers={orgMembers ?? []}
    />
  )
}
