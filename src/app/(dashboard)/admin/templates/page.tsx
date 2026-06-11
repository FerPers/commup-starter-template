import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import ItrTemplatesView from './ItrTemplatesView'

export default async function ItrTemplatesPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const [{ data: templates }, { data: disciplines }, { data: phases }] = await Promise.all([
    supabase
      .from('itr_templates')
      .select(`
        id, code, title, version, is_active, is_global, created_at,
        disciplines(id, code, name, color),
        project_phases(id, code, name, color, order_index),
        itr_template_sections(id, itr_template_items(id))
      `)
      .eq('org_id', membership.org_id)
      .order('code'),
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

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
          Templates ITR
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Biblioteca de Inspection &amp; Test Records — define una vez, ejecuta en campo
        </p>
      </div>

      <ItrTemplatesView
        templates={templates ?? []}
        disciplines={disciplines ?? []}
        phases={phases ?? []}
        canEdit={canEdit}
      />
    </div>
  )
}
