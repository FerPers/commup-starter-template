import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { isEditor } from '@/lib/auth/permissions'
import { loadGenerationTemplates, loadMembers, loadSourceItrs } from '@/lib/itr/source-itrs-server'
import LoopsView from './LoopsView'

export default async function LoopsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  const { data: loops } = await supabase
    .from('loops')
    .select(`
      id, loop_number, description, status,
      disciplines ( id, code, name, color ),
      subsystems (
        id, code, name,
        systems!inner (
          id, code, name,
          areas!inner ( id, code, name )
        )
      ),
      loop_tags ( id, role_in_loop, tags ( id, tag_number ) ),
      signals ( id, signal_tag, signal_type, origin, junction_box, marshalling, io_card, io_channel, dcs_tag, hmi_display, tags ( tag_number ) )
    `)
    .eq('project_id', id)
    .order('loop_number')

  // Fase 4-D: ITR de loop check por lazo (vigente, desactualizado, resultado por señal) y generación.
  const canEdit = isEditor(ctx.role)
  const [loopItrs, templates, members] = await Promise.all([
    loadSourceItrs(supabase, 'loop', (loops ?? []).map(l => l.id)),
    canEdit ? loadGenerationTemplates(supabase, ctx.orgId, 'loop_signals') : Promise.resolve([]),
    canEdit ? loadMembers(supabase, ctx.orgId) : Promise.resolve([]),
  ])

  return (
    <LoopsView
      projectId={project.id}
      projectName={project.name}
      loops={loops ?? []}
      loopItrs={loopItrs}
      templates={templates}
      members={members}
      canEdit={canEdit}
    />
  )
}
