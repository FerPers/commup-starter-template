import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import InstrumentationHub from './InstrumentationHub'
import SignalsView from './SignalsView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function SignalsPage({ params }: { params: Promise<{ id: string }> }) {
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

  // S09 (B-07): PostgREST corta en 1000 filas; un proyecto real tiene 10k–50k señales → se pagina.
  const [signalsRes, subsystemsRes] = await Promise.all([
    fetchAllRowsFlagged(() => supabase
    .from('signals')
    .select(`
      id, signal_tag, description, signal_type,
      eng_unit, range_min, range_max,
      service, alarm_setpoints, origin, destination,
      pid_drawing, loop_diagram, wiring_diagram, notes,
      loop_id, junction_box, marshalling, io_card, io_channel, dcs_tag, hmi_display,
      tags!inner (
        id, tag_number,
        subsystems!inner (
          id, code, name,
          systems!inner (
            id, code, name,
            areas!inner ( id, code, name )
          )
        ),
        disciplines ( id, code, name, color )
      )
    `)
    .eq('tags.project_id', id)
    .order('signal_tag')),
    fetchAllRowsFlagged(() => supabase
      .from('subsystems')
      .select('id, code, name, systems!inner(project_id)')
      .eq('systems.project_id', id)
      .order('code')),
  ])
  const signals = signalsRes.rows
  const subsystems = subsystemsRes.rows
  const truncated = signalsRes.truncated || subsystemsRes.truncated

  const tl = await getTranslations('Common')
  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
    <InstrumentationHub projectId={project.id} current="signals" canImport={ROLE_TIERS.privileged.includes(membership.role)} />
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <SignalsView
      projectId={project.id}
      projectName={project.name}
      signals={signals}
      subsystems={subsystems}
      canEdit={ROLE_TIERS.editor.includes(membership.role)}
    />
    </div>
  )
}
