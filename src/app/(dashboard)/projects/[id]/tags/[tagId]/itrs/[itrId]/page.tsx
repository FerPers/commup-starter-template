import { getActiveMembership } from '@/lib/supabase/membership'
import ResponseConflicts from './ResponseConflicts'
import { getProjectToday } from '@/lib/time/project-zones'
import { itemDescription } from '@/lib/itr/item-text'
import { getLocale } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import ItrExecution from './ItrExecution'
import type { EquipmentOption, EquipmentUsed } from './TestEquipmentSection'
import SuggestionsBar, { type ItrSuggestion } from '@/components/itr/SuggestionsBar'
import DocumentReferences from '@/components/documents/DocumentReferences'
import { loadDocumentRefs } from '@/lib/documents/refs-server'
import { isDocumentController } from '@/lib/documents/catalog'
import { ROLE_TIERS } from '@/lib/constants/roles'

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
      id, itr_number, status, progress_pct, scheduled_date, template_id, project_id, tag_id, loop_id, ce_cause_id, source_rows, required_signatures,
      loops(id, loop_number), ce_causes(id, code, description, ce_matrices(id, code)),
      itr_templates(
        id, code, title, version, requires_test_equipment,
        itr_template_sections(
          id, title, order_index,
          itr_template_items(
            id, item_number, description, description_es, item_type,
            is_critical, is_required, requires_photo, requires_document, requires_measurement,
            acceptance_min, acceptance_max, acceptance_text,
            unit, options, option_outcomes, order_index,
            condition_item_id, condition_value
          )
        )
      ),
      tags(id, tag_number, description, manufacturer, model, serial_number, datasheet_number, pid_drawing, range_min, range_max, eng_unit, revision, junction_box, disciplines(code, name, color)),
      project_phases(code, name, color),
      itr_assignments(id, user_id, role, profiles(full_name)),
      itr_responses(id, item_id, value_text, value_numeric, value_bool, value_option, remarks, is_passed, responded_at),
      itr_signatures(id, role, signed_at, user_id, signature_image, signer_company, profiles(full_name))
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

  // C-41 (S06): una sola llamada para todas las URL firmadas.
  const attachmentPaths = (rawAttachments ?? []).map(att => att.file_url)
  const { data: signedList } = attachmentPaths.length
    ? await supabase.storage.from('itr-attachments').createSignedUrls(attachmentPaths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] }
  const signedByPath = new Map((signedList ?? []).map(s => [s.path, s.signedUrl]))
  const attachments = (rawAttachments ?? []).map(att => ({ ...att, signed_url: signedByPath.get(att.file_url) ?? null }))

  const canEdit = ['owner', 'admin', 'architect', 'leader', 'inspector'].includes(membership.role)

  const { data: members } = await supabase.from('org_members').select('user_id, role, profiles(full_name)').eq('org_id', ctx.orgId)
  // S04 (C-01): los editores completan o cambian asignaciones de roles sin firmar.
  const canAssign = ROLE_TIERS.editor.includes(membership.role)

  // Fase 4-B: equipos de prueba usados (con su calibración al momento de uso) e inventario activo de la org.
  const [{ data: equipmentUsed }, { data: equipmentOptions }] = await Promise.all([
    supabase.from('itr_test_equipment')
      .select('equipment_id, used_on, calibrated_on, calibration_due, certificate_number, snapshot')
      .eq('itr_id', itrId)
      .order('added_at'),
    supabase.from('test_equipment')
      .select('id, code, kind, make, model, serial_number, calibrated_on, calibration_due')
      .eq('org_id', ctx.orgId)
      .eq('is_active', true)
      .order('code')
      .limit(1000),
  ])

  const { data: suggestions } = await supabase
    .from('itr_suggestions')
    .select('id, signal_tag, signal_value, signal_unit, sampled_at, message, suggested_at, expires_at, pre_filled_data')
    .eq('itr_id', itrId)
    .eq('status', 'pending')
    .order('suggested_at', { ascending: false })

  const docRefs = await loadDocumentRefs(supabase, projectId, 'itr', itrId)
  const locale = await getLocale()
  const signed = ((itr.itr_signatures as unknown as unknown[] | null) ?? []).length > 0

  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <SuggestionsBar suggestions={(suggestions ?? []) as ItrSuggestion[]} />
      </div>
      <ItrExecution
        itr={itr}
        projectId={projectId}
        tagId={tagId}
        currentUserId={ctx.userId}
        currentUserRole={membership.role}
        canEdit={canEdit}
        attachments={attachments}
        memberIds={(members ?? []).map(m => m.user_id)}
        punchAssignees={canEdit
          ? (members ?? []).filter(m => m.role !== 'client').map(m => ({ user_id: m.user_id, full_name: (m.profiles as { full_name: string } | null)?.full_name ?? m.user_id }))
            .sort((x, y) => x.full_name.localeCompare(y.full_name))
          : []}
        assignable={canAssign
          ? (members ?? []).map(m => ({ user_id: m.user_id, role: m.role, full_name: (m.profiles as { full_name: string } | null)?.full_name ?? m.user_id }))
            .sort((x, y) => x.full_name.localeCompare(y.full_name))
          : undefined}
        testEquipment={{
          requires: (itr.itr_templates as { requires_test_equipment?: boolean } | null)?.requires_test_equipment ?? false,
          used: (equipmentUsed ?? []) as EquipmentUsed[],
          options: (equipmentOptions ?? []) as EquipmentOption[],
        }}
        conflictsSlot={
          <ResponseConflicts
            itrId={itr.id}
            userId={ctx.userId}
            timezone={(await getProjectToday(supabase, projectId)).timezone}
            names={Object.fromEntries((members ?? []).map(m => [m.user_id, (m.profiles as { full_name: string } | null)?.full_name ?? '']))}
            labels={Object.fromEntries(((itr.itr_templates as { itr_template_sections?: { itr_template_items: { id: string; item_number: string | null; description: string; description_es: string | null }[] }[] } | null)?.itr_template_sections ?? [])
              .flatMap(sec => sec.itr_template_items)
              .map(it => [it.id, `${it.item_number ? `${it.item_number} ` : ''}${itemDescription(it, locale === 'en' ? 'en' : 'es')}`]))}
          />
        }
        documentsSlot={(docRefs.refs.length > 0 || canEdit) && (
          <DocumentReferences projectId={projectId} kind="itr" targetId={itrId} refs={docRefs.refs} options={docRefs.options}
            locked={signed} canEdit={membership.role !== 'client'} canRevalidate={isDocumentController(membership.role)} />
        )}
      />
    </>
  )
}
