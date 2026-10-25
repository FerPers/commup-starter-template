import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { TaskSection } from './_shared'
import { StateChip } from '@/components/ui'
import { TONE_STYLE, punchCategoryState, punchState } from '@/lib/states'
import { todayIn } from '@/lib/time/zone'

/** S09 (B-07): el widget muestra los más urgentes; la lista completa vive en /punch-list. */
const WIDGET_LIMIT = 50

export default async function MyPunchesWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ data: myPunches }, { count: total }] = await Promise.all([
    supabase
      .from('punches')
      .select(`id, punch_number, category, description, status, priority, target_date, resolved_at, project_id, projects(id, name, code, timezone), tags(tag_number)`)
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress'])
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('id')
      .limit(WIDGET_LIMIT),
    supabase
      .from('punches')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress']),
  ])


  const items = myPunches ?? []


  return (
    <TaskSection title={t('inspector.myPunches')} count={total ?? items.length} emptyText={t('inspector.myPunchesEmpty')}>
      {(items ?? []).map(p => {
        const cat = punchCategoryState(p.category)
        // S10 (G-13): vencido según el día del proyecto, no el de UTC
        const overdue = p.target_date && p.target_date < todayIn((p.projects as { timezone?: string } | null)?.timezone)
        return (
          <Link key={p.id} href={`/projects/${p.project_id}/punches`} style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ padding: '14px 16px', background: 'var(--card-bg)', border: `1px solid ${overdue ? 'var(--danger-200)' : 'var(--border)'}`, borderLeft: `3px solid ${TONE_STYLE[cat.tone].fg}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <StateChip state={cat} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>{p.description}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{p.projects?.code} · {p.tags?.tag_number}</div>
              </div>
              <StateChip state={punchState({ status: p.status, resolvedAt: p.resolved_at })} />
            </div>
          </Link>
        )
      })}
    </TaskSection>
  )
}
