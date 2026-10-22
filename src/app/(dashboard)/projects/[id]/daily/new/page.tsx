import { dailyTabHref } from '@/lib/navigation/hub-routes'
import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { MGMT_KINDS, type MgmtKind } from '@/lib/daily/catalog'
import { loadOptions } from '../options'
import NewDailyForm, { type SourceRef } from './NewDailyForm'
import { loadTagContext } from '@/lib/create/tag-context'

// Alta de acción / restricción / TQ / decisión. `source` + `sourceId` vinculan la acción o la decisión
// con la restricción o el TQ de origen; `supersedes` reemplaza una decisión vigente.
export default async function NewDailyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string; source?: string; sourceId?: string; supersedes?: string; systemId?: string; tag?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  // N3b: el cliente solo levanta TQ (create_tq lo permite; el resto de las altas, no).
  if (ctx.role === 'client' && sp.kind !== 'tq') redirect(dailyTabHref(id, 'tqs'))
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const kind: MgmtKind = MGMT_KINDS.includes(sp.kind as MgmtKind) ? (sp.kind as MgmtKind) : 'action'
  // S15 (D-16/I-27): las decisiones formales las registra un líder o superior (la RPC lo exige).
  if (kind === 'decision' && !ROLE_TIERS.editor.includes(ctx.role)) redirect(dailyTabHref(id, 'decisions'))

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

  // N3b: ＋ Crear desde la ficha de un tag precarga su sistema (y en un TQ, el tag).
  const [{ members, systems, gates, disciplines }, tag] = await Promise.all([
    loadOptions(supabase, ctx.orgId, id),
    loadTagContext(supabase, id, sp.tag),
  ])
  const options = { members, systems, gates, disciplines }

  return (
    <NewDailyForm
      project={project}
      kind={kind}
      opts={options}
      userId={ctx.userId}
      source={source}
      supersedes={supersedes}
      initialSystemId={(options.systems.some(s => s.id === sp.systemId) ? sp.systemId : source?.systemId ?? tag?.systemId) ?? ''}
      initialTag={tag ? { tag_id: tag.id, tag_number: tag.tagNumber } : null}
    />
  )
}
