import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import BackupRestoreView from './BackupRestoreView'

export default async function TemplatesBackupPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(ctx.role)
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
          Backup &amp; Restore de Templates
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Exporta todos los templates (ITR, Preservación, PSSR) a JSON y restáuralos cuando lo necesites
        </p>
      </div>

      <BackupRestoreView orgName={org?.name ?? 'org'} orgSlug={org?.slug ?? null} />
    </div>
  )
}
