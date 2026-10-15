import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { REGISTER_KINDS, type RegisterKind } from '@/lib/registers/catalog'
import NewRegisterForm from './NewRegisterForm'

export default async function NewRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kind?: string; systemId?: string; linkTo?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (ctx.role === 'client') redirect(`/projects/${id}/registers`)
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  await supabase.rpc('ensure_register_types', { p_org_id: ctx.orgId })
  const [{ data: types }, { data: systems }, { data: linkTo }] = await Promise.all([
    supabase.from('register_types').select('kind, is_active').eq('org_id', ctx.orgId),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    sp.linkTo
      ? supabase.from('register_items').select('id, number, system_id').eq('id', sp.linkTo).eq('project_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const systemId = sp.systemId ?? linkTo?.system_id ?? undefined
  const active = (types ?? []).filter(t => t.is_active).map(t => t.kind as RegisterKind)
  const initialKind = REGISTER_KINDS.includes(sp.kind as RegisterKind) && active.includes(sp.kind as RegisterKind)
    ? (sp.kind as RegisterKind) : active[0]
  if (!initialKind) redirect(`/projects/${id}/registers`)

  return (
    <NewRegisterForm
      project={project}
      kinds={REGISTER_KINDS.filter(k => active.includes(k))}
      initialKind={initialKind}
      systems={systems ?? []}
      initialSystemId={(systems ?? []).some(s => s.id === systemId) ? systemId! : ''}
      linkTo={linkTo ? { id: linkTo.id, number: linkTo.number } : null}
    />
  )
}
