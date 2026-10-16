import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { MGMT_KINDS, type MgmtKind } from '@/lib/daily/catalog'
import { loadOptions } from '../options'
import NewDailyForm, { type SourceRef } from './NewDailyForm'

// Alta de acción / restricción / TQ / decisión. `source` + `sourceId` vinculan la acción o la decisión
// con la restricción o el TQ de origen; `supersedes` reemplaza una decisión vigente.
export default async function NewDailyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string; source?: string; sourceId?: string; supersedes?: string; systemId?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (ctx.role === 'client') redirect(`/projects/${id}/daily`)
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const kind: MgmtKind = MGMT_KINDS.includes(sp.kind as MgmtKind) ? (sp.kind as MgmtKind) : 'action'

  // Origen (restricción o TQ del mismo proyecto): número para mostrar y sistema para precargar.
  let source: SourceRef | null = null
  if (sp.sourceId && (sp.source === 'constraint' || sp.source === 'tq')) {
    const { data } = sp.source === 'constraint'
      ? await supabase.from('project_constraints').select('id, number, title, system_id').eq('id', sp.sourceId).eq('project_id', id).maybeSingle()
      : await supabase.from('technical_queries').select('id, number, title:subject, system_id').eq('id', sp.sourceId).eq('project_id', id).maybeSingle()
    if (data) source = { kind: sp.source, id: data.id, number: data.number, title: data.title, systemId: data.system_id }
  }
  const { data: supersedes } = kind === 'decision' && sp.supersedes
    ? await supabase.from('decisions').select('id, number, title, decision, context, rationale, system_id, status')
        .eq('id', sp.supersedes).eq('project_id', id).eq('status', 'active').maybeSingle()
    : { data: null }

  const { members, systems, gates, disciplines } = await loadOptions(supabase, ctx.orgId, id)
  const options = { members, systems, gates, disciplines }

  return (
    <NewDailyForm
      project={project}
      kind={kind}
      opts={options}
      userId={ctx.userId}
      source={source}
      supersedes={supersedes}
      initialSystemId={(options.systems.some(s => s.id === sp.systemId) ? sp.systemId : source?.systemId) ?? ''}
    />
  )
}
