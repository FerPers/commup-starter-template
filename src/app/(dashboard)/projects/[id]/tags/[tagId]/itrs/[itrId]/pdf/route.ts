import { createClient } from '@/lib/supabase/server'
import { renderItrPdf } from '@/lib/pdf/itr'

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
        profiles ( full_name )
      ),
      tags ( tag_number, description ),
      projects ( code, name )
    `)
    .eq('id', itrId)
    .eq('project_id', projectId)
    .eq('tag_id', tagId)
    .single()

  if (error || !itr) {
    return new Response('ITR not found', { status: 404 })
  }

  const bytes = await renderItrPdf(itr)
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
