import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SummaryPill } from './_shared'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'

export default async function InspectorSummaryWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ data: assignments }, { count: punchCount }] = await Promise.all([
    // S09 (B-07): solo las activas, paginado
    fetchAllRowsFlagged(() => supabase
      .from('itr_assignments')
      .select('itrs!inner(id, status)')
      .eq('user_id', userId)
      .not('itrs.status', 'in', '(approved,rejected)'), { maxRows: 10_000 }).then(r => ({ data: r.rows })),
    supabase
      .from('punches')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress']),
  ])

  const seen = new Set<string>()
  const activeItrs = (assignments ?? []).filter(a => {
    const itr = a.itrs
    if (!itr || ['approved', 'rejected'].includes(itr.status ?? '')) return false
    if (seen.has(itr.id)) return false
    seen.add(itr.id)
    return true
  })
  const inProgress = activeItrs.filter(a => a.itrs?.status === 'in_progress').length

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <SummaryPill count={activeItrs.length} label={t('inspector.pillItrs')} color="var(--primary-500)" />
      <SummaryPill count={punchCount ?? 0} label={t('inspector.pillPunches')} color="var(--danger-500)" />
      <SummaryPill count={inProgress} label={t('inspector.pillProgress')} color="var(--success-500)" />
    </div>
  )
}
