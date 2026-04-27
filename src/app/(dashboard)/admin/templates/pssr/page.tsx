import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PssrTemplatesView from './PssrTemplatesView'

export default async function PssrTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/setup')

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
          Templates PSSR
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Checklist Pre-Startup Safety Review — define los ítems de verificación para el arranque
        </p>
      </div>
      <PssrTemplatesView templates={(templates ?? []) as any[]} canEdit={canEdit} />
    </div>
  )
}