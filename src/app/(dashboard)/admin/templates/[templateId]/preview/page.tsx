import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TemplatePreview from './TemplatePreview'

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TemplatePreview template={template as any} />
}