import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import TemplatePreview from './TemplatePreview'

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: template } = await supabase
    .from('itr_templates')
    .select(`
      id, code, title, description, version, is_active,
      disciplines(id, code, name, color),
      project_phases(id, code, name, color),
      itr_template_sections(
        id, title, order_index,
        itr_template_items(
          id, item_number, description, description_es, item_type,
          is_required, is_critical, requires_photo, requires_measurement,
          unit, acceptance_min, acceptance_max, acceptance_text, options, order_index
        )
      )
    `)
    .eq('id', templateId)
    .eq('org_id', membership.org_id)
    .single()

  if (!template) notFound()

  return <TemplatePreview template={template} />
}