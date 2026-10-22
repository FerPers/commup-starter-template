import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import PreservationGlobal from './PreservationGlobal'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// N2c: «Todos los proyectos» de la lista del proyecto (`?scope=all`); antes era la página global.
export default async function AllPreservation() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('org_id', membership.org_id)
    .order('name')

  const projectIds = (projects ?? []).map(p => p.id)

  // S09 (B-07): PostgREST corta en 1000 filas → se pagina.
  const { rows: plans, truncated } = projectIds.length === 0
    ? { rows: [], truncated: false }
    : await fetchAllRowsFlagged(() => supabase
        .from('preservation_plans')
        .select(`
          id, status, start_date, next_due_date, last_performed_date, project_id,
          projects(id, name, code),
          tags(id, tag_number, description),
          preservation_procedures(id, code, title, frequency, interval_days)
        `)
        .in('project_id', projectIds)
        .order('next_due_date', { ascending: true }))

  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <PreservationGlobal
      projects={projects ?? []}
      plans={plans}
    />
    </>
  )
}
