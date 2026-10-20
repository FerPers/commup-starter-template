import { createClient } from '@/lib/supabase/server'
import { renderItrPdf, type ItrDocumentRef, type ItrTestEquipmentRef } from '@/lib/pdf/itr'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tagId: string; itrId: string }> }
) {
  const { id: projectId, tagId, itrId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: itr, error } = await supabase
    .from('itrs')
    .select(`
      id,
      itr_number,
      status,
      progress_pct,
      scheduled_date,
      template_id,
      project_id,
      tag_id,
      source_rows,
      required_signatures,
      loops ( loop_number ),
      ce_causes ( code, description, ce_matrices ( code ) ),
      itr_templates (
        code,
        title,
        title_es,
        description,
        itr_template_sections (
          id,
          title,
          order_index,
          itr_template_items (
            id,
            item_number,
            description,
            description_es,
            item_type,
            is_critical,
            is_required,
            acceptance_min,
            acceptance_max,
            acceptance_text,
            unit,
            options,
            order_index
          )
        )
      ),
      itr_responses (
        item_id,
        value_text,
        value_numeric,
        value_bool,
        value_option,
        remarks,
        is_passed
      ),
      itr_signatures (
        role,
        signed_at,
        signature_image,
        signer_company,
        profiles ( full_name )
      ),
      itr_attachments (
        item_id,
        file_url,
        file_type,
        captured_at
      ),
      itr_test_equipment ( used_on, calibrated_on, calibration_due, certificate_number, snapshot ),
      tags ( tag_number, description, manufacturer, model, serial_number, datasheet_number, pid_drawing, range_min, range_max, eng_unit, revision ),
      projects ( code, name )
    `)
    .eq('id', itrId)
    .eq('project_id', projectId)
    .eq('tag_id', tagId)
    .single()

  if (error || !itr) {
    return new Response('ITR not found', { status: 404 })
  }

  // S13 (F-11): documentos de referencia con la revisión usada y la vigente al imprimir.
  const { data: refs } = await supabase.from('document_references')
    .select('revalidation_reason, used:document_revisions!document_references_revision_id_fkey(rev, status), from:document_revisions!document_references_revalidated_from_fkey(rev), documents(number, title, current:document_revisions!documents_current_revision_fkey(rev))')
    .eq('project_id', projectId).eq('itr_id', itrId)
  type Rev = { rev: string; status?: string } | null
  const documentRefs: ItrDocumentRef[] = (refs ?? []).map(x => {
    const d = x.documents as unknown as { number: string; title: string; current: Rev } | null
    const used = x.used as unknown as Rev
    return {
      number: d?.number ?? '-', title: d?.title ?? '', used_rev: used?.rev ?? '-', used_status: used?.status ?? null,
      current_rev: d?.current?.rev ?? null, revalidated_from: (x.from as unknown as Rev)?.rev ?? null, revalidation_reason: x.revalidation_reason,
    }
  }).sort((a, b) => a.number.localeCompare(b.number))

  const bytes = await renderItrPdf({
    ...itr,
    document_refs: documentRefs,
    // snapshot es jsonb: la foto de calibración que copió el trigger al registrar el equipo.
    itr_test_equipment: (itr.itr_test_equipment ?? []).map(u => ({ ...u, snapshot: u.snapshot as ItrTestEquipmentRef['snapshot'] })),
  })
  const filename = `ITR-${itr.itr_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
