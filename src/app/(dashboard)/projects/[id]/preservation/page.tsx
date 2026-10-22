import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import PreservationGlobal from '../../../preservation/PreservationGlobal'
import AllPreservation from '../../../preservation/AllPreservation'
import ScopeToggle from '@/components/navigation/ScopeToggle'
import { isScopeAll } from '@/lib/list/scope'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// H-08 (S08): preservación del proyecto. Antes no existía (el aviso de vencido enlazaba aquí y daba 404)
// y para ejecutar un plan había que entrar al tag → pestaña Preservación.
export default async function ProjectPreservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const { data: project } = await ctx.supabase.from('projects').select('id, name, code').eq('id', id).eq('org_id', ctx.orgId).maybeSingle()
  if (!project) notFound()
  // N2c: alcance «Todos los proyectos» (antes la página global).
  if (isScopeAll(sp.scope)) return <><ScopeToggle projectId={id} list="preservation" all /><AllPreservation /></>

  // S09 (B-07): PostgREST corta en 1000 filas → se pagina.
  const { rows: plans, truncated } = await fetchAllRowsFlagged(() => ctx.supabase
    .from('preservation_plans')
    .select(`
      id, status, start_date, next_due_date, last_performed_date, project_id,
      projects(id, name, code),
      tags(id, tag_number, description),
      preservation_procedures(id, code, title, frequency, interval_days)
    `)
    .eq('project_id', id)
    .order('next_due_date', { ascending: true }))

  const tl = await getTranslations('Common')
  return (
    <>
    <ScopeToggle projectId={id} list="preservation" all={false} />
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <PreservationGlobal projects={[project]} plans={plans} projectScope={project} />
    </>
  )
}
