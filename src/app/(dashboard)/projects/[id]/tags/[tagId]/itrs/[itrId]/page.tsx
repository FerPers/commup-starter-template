import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ItrExecution from './ItrExecution'
import SuggestionsBar, { type ItrSuggestion } from '@/components/itr/SuggestionsBar'

export default async function ItrExecutionPage({
  params,
}: {
  params: Promise<{ id: string; tagId: string; itrId: string }>
}) {
  const { id: projectId, tagId, itrId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: itr } = await supabase
    .from('itrs')
    .select(`
      id, itr_number, status, progress_pct, scheduled_date, template_id, project_id, tag_id,
      itr_templates(
        id, code, title, version,
        itr_template_sections(
          id, title, order_index,
          itr_template_items(
            id, item_number, description, description_es, item_type,
            is_critical, is_required, requires_photo, requires_measurement,
            acceptance_min, acceptance_max, acceptance_text,
            unit, options, order_index,
            condition_item_id, condition_value
          )
        )
      ),
      tags(id, tag_number, description, disciplines(code, name, color)),
      project_phases(code, name, color),
      itr_assignments(id, user_id, role, profiles(full_name)),
      itr_responses(id, item_id, value_text, value_numeric, value_bool, value_option, remarks, is_passed, responded_at),
      itr_signatures(id, role, signed_at, user_id, signature_image, profiles(full_name))
    `)
    .eq('id', itrId)
    .eq('project_id', projectId)
    .single()

  if (!itr) notFound()

  // Fetch existing attachments + generate signed URLs
  const { data: rawAttachments } = await supabase
    .from('itr_attachments')
    .select('id, item_id, file_url, file_type, captured_at, uploaded_by')
    .eq('itr_id', itrId)
    .order('captured_at', { ascending: true })

  const attachments = await Promise.all(
    (rawAttachments ?? []).map(async att => {
      const { data: signed } = await supabase.storage
        .from('itr-attachments')
        .createSignedUrl(att.file_url, 3600)
      return { ...att, signed_url: signed?.signedUrl ?? null }
    })
  )

  const canEdit = ['owner', 'admin', 'architect', 'leader', 'inspector'].includes(membership.role)

  const { data: suggestions } = await supabase
    .from('itr_suggestions')
    .select('id, signal_tag, signal_value, signal_unit, sampled_at, message, suggested_at, expires_at, pre_filled_data')
    .eq('itr_id', itrId)
    .eq('status', 'pending')
    .order('suggested_at', { ascending: false })

  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <SuggestionsBar suggestions={(suggestions ?? []) as ItrSuggestion[]} />
      </div>
      <ItrExecution
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itr={itr as any}
        projectId={projectId}
        tagId={tagId}
        currentUserId={ctx.userId}
        currentUserRole={membership.role}
        canEdit={canEdit}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachments={attachments as any}
      />
    </>
  )
}
