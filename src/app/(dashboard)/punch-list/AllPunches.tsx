import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import PunchListView from '../projects/[id]/punches/PunchListView'
import { fetchPunchPage, fetchPunchSummary, PUNCH_SORT_KEYS } from '@/lib/list/punch-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'

export type Search = { page?: string; sort?: string; dir?: string; cat?: string; status?: string; disc?: string; q?: string; project?: string; assigned?: string; phase?: string }

// N2c: «Todos los proyectos» de la lista del proyecto (`?scope=all`); antes era la página global.
// G-14: misma vista que el proyecto, con alcance org; `projectId` = proyecto del contexto (volver).
export default async function AllPunches({ projectId, sp }: { projectId: string; sp: Search }) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, PUNCH_SORT_KEYS, 'created_at')
  const dir = parseDir(sp.dir, sort === 'created_at' ? 'desc' : 'asc')
  // N0 (H-19): «Ver todos» de Mi trabajo llega con assigned=me.
  const filters = { cat: sp.cat, status: sp.status, disc: sp.disc, q: sp.q, project: sp.project, assigned: sp.assigned === 'me' ? ctx.userId : undefined, phase: sp.phase }
  const scope = { orgId: ctx.orgId }

  const [{ data: projects }, pageRes, summary, { data: disciplines }, { data: orgMembers }, { data: phases }] = await Promise.all([
    supabase.from('projects').select('id, name, code').eq('org_id', ctx.orgId).order('name'),
    fetchPunchPage(supabase, scope, { filters, page, sort, dir }),
    fetchPunchSummary(supabase, scope),
    supabase.from('disciplines').select('id, code, name, color').eq('org_id', ctx.orgId).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId).order('role'),
    supabase.from('project_phases').select('code, name').eq('org_id', ctx.orgId).order('order_index'),
  ])

  const context = (projects ?? []).find(p => p.id === projectId)
  if (!context) notFound()

  const tc = await getTranslations('Common')
  return (
    <>
      {pageRes.searchCapped && <PartialNote>{tc('searchPartial')}</PartialNote>}
      <PunchListView
        projectId={projectId}
        projectName={context.name}
        projects={projects ?? []}
        currentUserRole={ctx.role}
        punches={pageRes.rows}
        total={pageRes.total}
        page={page}
        pageSize={LIST_PAGE_SIZE}
        summary={summary}
        filters={{ project: sp.project ?? '', cat: sp.cat ?? '', status: sp.status ?? '', disc: sp.disc ?? '', system: '', q: sp.q ?? '', assigned: sp.assigned === 'me' ? 'me' : '', phase: sp.phase ?? '' }}
        phases={phases ?? []}
        disciplines={disciplines ?? []}
        systems={[]}
        orgMembers={orgMembers ?? []}
      />
    </>
  )
}
