import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { canRaisePunch } from '@/lib/constants/punch-roles'
import { loadTagContext } from '@/lib/create/tag-context'
import { safeBack } from '@/lib/create/catalog'
import NewPunchForm from './NewPunchForm'

// N3b: alta de punch con página propia (antes solo una ventana en la lista y en el tag). `?tag=` lo precarga
// (＋ Crear desde la ficha del tag) y `?back=` es adónde vuelve al crear; sin `back`, abre el punch nuevo.
export default async function NewPunchPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tag?: string; back?: string }>
}) {
  const { id: projectId } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!canRaisePunch(ctx.role)) redirect(`/projects/${projectId}/punches`)
  const supabase = ctx.supabase

  const [{ data: project }, tag, { data: members }] = await Promise.all([
    supabase.from('projects').select('id, code, name').eq('id', projectId).eq('org_id', ctx.orgId).maybeSingle(),
    loadTagContext(supabase, projectId, sp.tag),
    // bounded: miembros de la org
    supabase.from('org_members').select('user_id, role, profiles(full_name)').eq('org_id', ctx.orgId).limit(2000),
  ])
  if (!project) notFound()

  const assignees = (members ?? [])
    .filter(m => m.role !== 'client')
    .map(m => ({ user_id: m.user_id, full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? m.user_id }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  return (
    <NewPunchForm
      project={project}
      initialTag={tag}
      assignees={assignees}
      back={safeBack(sp.back)}
    />
  )
}
