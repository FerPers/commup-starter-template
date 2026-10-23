import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isMyTurnToSign } from '@/lib/my-work/queues'
import { SummaryPill } from './_shared'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'

export default async function ClientSummaryWidget({ userId, orgId }: { userId: string; orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ count: projectCount }, { data: clientAssignments }] = await Promise.all([
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    // S09 (B-07): sin los aprobados, paginado
    fetchAllRowsFlagged(() => supabase
      .from('itr_assignments')
      .select(`itrs!inner(id, status, required_signatures, itr_signatures(role, user_id))`)
      .eq('user_id', userId)
      .eq('role', 'client')
      .neq('itrs.status', 'approved'), { maxRows: 10_000 }).then(r => ({ data: r.rows })),
  ])

  const pendingSignature = (clientAssignments ?? []).filter(a => {
    const itr = a.itrs
    // S04: le toca al cliente cuando el ITR lo exige y están las firmas requeridas anteriores (misma regla que Mi trabajo).
    return !!itr && isMyTurnToSign('client', itr.status, itr.itr_signatures.map(s => s.role), itr.required_signatures, itr.itr_signatures.some(s => s.user_id === userId))
  }).length

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <SummaryPill count={projectCount ?? 0} label={t('clientView.pillProjects')} color='var(--primary-700)' />
      <SummaryPill count={pendingSignature} label={t('clientView.pillSignatures')} color={pendingSignature > 0 ? 'var(--warning-700)' : 'var(--success-700)'} />
    </div>
  )
}
