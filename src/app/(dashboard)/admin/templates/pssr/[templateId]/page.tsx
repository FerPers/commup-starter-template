import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PssrTemplateEditor from './PssrTemplateEditor'

export default async function PssrTemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner','admin','architect','leader'].includes(membership.role)

  const { data: template } = await supabase
    .from('pssr_templates')
    .select('id, name, description, is_active')
    .eq('id', templateId)
    .eq('org_id', membership.org_id)
    .single()
  if (!template) notFound()

  const { data: items } = await supabase
    .from('pssr_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('item_order')

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <a href="/admin/templates/pssr" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Templates PSSR
        </a>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0', letterSpacing: '-0.4px' }}>
          {template.name}
        </h1>
        {template.description && (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{template.description}</p>
        )}
      </div>
      <PssrTemplateEditor
        template={template}
        items={(items ?? []) as any[]}
        canEdit={canEdit}
      />
    </div>
  )
}