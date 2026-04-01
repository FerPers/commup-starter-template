import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TagDetail from './TagDetail'

export default async function TagDetailPage({
  params,
}: {
  params: Promise<{ id: string; tagId: string }>
}) {
  const { id: projectId, tagId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const canEdit = ['owner', 'admin', 'architect'].includes(membership.role)

  const [
    { data: project },
    { data: tag },
    { data: allTagIds },
    { data: tagItrs },
    { data: orgMembers },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('tags')
      .select(`
        id, tag_number, description, status,
        manufacturer, model, serial_number,
        preservation_required, pid_drawing,
        range_min, range_max, eng_unit,
        sp_h, sp_hh, sp_l, sp_ll,
        signal_type, sil_level, io_address, junction_box, datasheet_number, revision,
        disciplines(id, code, name, color),
        subsystems(
          id, code, name,
          systems(id, code, name, areas(id, code, name))
        )
      `)
      .eq('id', tagId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('tags')
      .select('id')
      .eq('project_id', projectId)
      .order('tag_number'),
    supabase
      .from('itrs')
      .select(`
        id, itr_number, status, progress_pct, scheduled_date, created_at,
        itr_templates(code, title, disciplines(code, name, color)),
        project_phases(code, name, color),
        itr_assignments(user_id, role, profiles(full_name)),
        itr_signatures(id, role, signed_at)
      `)
      .eq('tag_id', tagId)
      .order('created_at', { ascending: false }),
    supabase
      .from('org_members')
      .select('user_id, role, profiles(full_name)')
      .eq('org_id', membership.org_id)
      .order('role'),
  ])

  if (!project) notFound()
  if (!tag) notFound()

  // Templates for this tag's discipline (sequential — needs disciplineId)
  const { data: templates } = await supabase
    .from('itr_templates')
    .select('id, code, title, phase_id, project_phases(id, code, name, color)')
    .eq('org_id', membership.org_id)
    .eq('is_active', true)
    .eq('discipline_id', (tag.disciplines as unknown as { id: string }).id)
    .order('code')

  // Prev / next tag navigation
  const tagIndex = (allTagIds ?? []).findIndex(t => t.id === tagId)
  const prevTagId = tagIndex > 0 ? allTagIds![tagIndex - 1].id : null
  const nextTagId = tagIndex < (allTagIds?.length ?? 0) - 1 ? allTagIds![tagIndex + 1].id : null

  // P&ID signed URL
  let pidSignedUrl: string | null = null
  if (tag.pid_drawing) {
    const { data: pidDoc } = await supabase
      .from('pid_documents')
      .select('file_path')
      .eq('project_id', projectId)
      .eq('drawing_number', tag.pid_drawing)
      .maybeSingle()

    if (pidDoc) {
      const { data: signed } = await supabase.storage
        .from('pid-documents')
        .createSignedUrl(pidDoc.file_path, 3600)
      pidSignedUrl = signed?.signedUrl ?? null
    }
  }

  return (
    <TagDetail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tag={tag as any}
      projectId={projectId}
      projectName={project.name}
      pidSignedUrl={pidSignedUrl}
      prevTagId={prevTagId}
      nextTagId={nextTagId}
      canEdit={canEdit}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tagItrs={(tagItrs ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templates={(templates ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgMembers={(orgMembers ?? []) as any}
    />
  )
}
