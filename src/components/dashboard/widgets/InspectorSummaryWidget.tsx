import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SummaryPill } from './_shared'

export default async function InspectorSummaryWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ data: assignments }, { count: punchCount }] = await Promise.all([
    supabase
      .from('itr_assignments')
      .select('itrs(id, status)')
      .eq('user_id', userId),
    supabase
      .from('punches')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress']),
  ])

  type ItrMini = { id: string; status: string | null } | null
  const seen = new Set<string>()
  const activeItrs = (assignments ?? []).filter(a => {
    const itr = a.itrs as unknown as ItrMini
    if (!itr || ['approved', 'rejected'].includes(itr.status ?? '')) return false
    if (seen.has(itr.id)) return false
    seen.add(itr.id)
    return true
  })
  const inProgress = activeItrs.filter(a => (a.itrs as unknown as ItrMini)?.status === 'in_progress').length

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <SummaryPill count={activeItrs.length} label={t('inspector.pillItrs')} color="var(--primary-500)" />
      <SummaryPill count={punchCount ?? 0} label={t('inspector.pillPunches')} color="var(--danger-500)" />
      <SummaryPill count={inProgress} label={t('inspector.pillProgress')} color="var(--success-500)" />
    </div>
  )
}
