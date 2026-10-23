import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import BackupRestoreView from './BackupRestoreView'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function TemplatesBackupPage() {
  const t = await getTranslations('TemplatesBackup')
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const canEdit = ROLE_TIERS.editor.includes(ctx.role)
  if (!canEdit) redirect('/admin/templates')

  const { data: org } = await ctx.supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', ctx.orgId)
    .maybeSingle()

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
          {t('pageTitle')}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {t('pageSubtitle')}
        </p>
      </div>

      <BackupRestoreView orgName={org?.name ?? 'org'} orgSlug={org?.slug ?? null} />
    </div>
  )
}
