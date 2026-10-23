import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PreservationProceduresView from './PreservationProceduresView'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function PreservationProceduresPage() {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = await getTranslations('Sidebar.nav')
  const t = await getTranslations('PreservationTemplates')
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ROLE_TIERS.editor.includes(membership.role)

  const [{ data: procedures }, { data: disciplines }] = await Promise.all([
    supabase
      .from('preservation_procedures')
      .select(`
        id, code, title, description, frequency, interval_days,
        requires_photo, requires_signature,
        disciplines(id, code, name, color),
        preservation_procedure_items(id)
      `)
      .eq('org_id', membership.org_id)
      .order('code'),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
  ])

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
          {tNav('preservationTemplates')}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {t('pageSubtitle')}
        </p>
      </div>

      <PreservationProceduresView
        procedures={procedures ?? []}
        disciplines={disciplines ?? []}
        canEdit={canEdit}
      />
    </div>
  )
}
