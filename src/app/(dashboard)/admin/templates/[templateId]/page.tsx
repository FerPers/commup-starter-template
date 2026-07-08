import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import TemplateBuilder from './TemplateBuilder'

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const [{ data: template }, { data: disciplines }, { data: phases }] = await Promise.all([
    supabase
      .from('itr_templates')
      .select(`
        id, code, title, description, version, is_active, is_global,
        disciplines(id, code, name, color),
        project_phases(id, code, name, color, order_index),
        itr_template_sections(
          id, title, order_index,
          itr_template_items(
            id, item_number, description, description_es, item_type,
            is_required, is_critical, requires_photo, requires_measurement,
            unit, acceptance_min, acceptance_max, acceptance_text, options, order_index,
            condition_item_id, condition_value
          )
        )
      `)
      .eq('id', templateId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  if (!template) notFound()

  return (
    <TemplateBuilder
      template={template}
      disciplines={disciplines ?? []}
      phases={phases ?? []}
      canEdit={canEdit}
    />
  )
}
