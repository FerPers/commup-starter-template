import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PssrTemplatesView from './PssrTemplatesView'

export default async function PssrTemplatesPage() {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = await getTranslations('Sidebar.nav')
  const tPage = await getTranslations('PssrTemplates')
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner','admin','architect','leader'].includes(membership.role)

  const { data: templates } = await supabase
    .from('pssr_templates')
    .select('id, name, description, is_active, created_at, pssr_template_items(id)')
    .eq('org_id', membership.org_id)
    .order('created_at')

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
          {tNav('pssrTemplates')}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {tPage('pageSubtitle')}
        </p>
      </div>
      <PssrTemplatesView templates={templates ?? []} canEdit={canEdit} />
    </div>
  )
}