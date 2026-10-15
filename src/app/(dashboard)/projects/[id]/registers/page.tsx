import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { RegisterKind, RegisterStatus } from '@/lib/registers/catalog'
import RegistersView, { type RegisterRow } from './RegistersView'

// Registros controlados del proyecto (fase 3 plan readiness): lista con filtros por tipo y estado.
export default async function RegistersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()
  if (!project) notFound()

  await supabase.rpc('ensure_register_types', { p_org_id: ctx.orgId })
  const [{ data: items }, { data: types }] = await Promise.all([
    supabase
      .from('register_items')
      .select('id, number, kind, title, status, updated_at, systems(code, name), register_item_tags(tags(tag_number))')
      .eq('project_id', id)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase.from('register_types').select('kind, is_active').eq('org_id', ctx.orgId),
  ])

  const rows: RegisterRow[] = (items ?? []).map(r => {
    const sys = r.systems as { code: string; name: string } | null
    const tags = (r.register_item_tags as unknown as { tags: { tag_number: string } | null }[] | null) ?? []
    return {
      id: r.id,
      number: r.number,
      kind: r.kind as RegisterKind,
      title: r.title,
      status: r.status as RegisterStatus,
      updated_at: r.updated_at,
      system: sys ? sys.code : null,
      tags: tags.map(t => t.tags?.tag_number).filter((x): x is string => !!x),
    }
  })

  return (
    <RegistersView
      project={project}
      rows={rows}
      activeKinds={(types ?? []).filter(t => t.is_active).map(t => t.kind as RegisterKind)}
      canCreate={ctx.role !== 'client'}
    />
  )
}
