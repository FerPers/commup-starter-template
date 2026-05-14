import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SummaryPill } from './_shared'

export default async function ClientSummaryWidget({ userId, orgId }: { userId: string; orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ count: projectCount }, { data: clientAssignments }] = await Promise.all([
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('itr_assignments')
      .select(`itrs(id, status, itr_signatures(role))`)
      .eq('user_id', userId)
      .eq('role', 'client'),
  ])

  type ItrWithSigs = { id: string; status: string | null; itr_signatures: Array<{ role: string }> } | null
  const pendingSignature = (clientAssignments ?? []).filter(a => {
    const itr = a.itrs as unknown as ItrWithSigs
    return itr && itr.status === 'completed' && !itr.itr_signatures.some(s => s.role === 'client')
  }).length

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <SummaryPill count={projectCount ?? 0} label={t('clientView.pillProjects')} color="var(--primary-500)" />
      <SummaryPill count={pendingSignature} label={t('clientView.pillSignatures')} color={pendingSignature > 0 ? 'var(--warning-500)' : 'var(--success-500)'} />
    </div>
  )
}
