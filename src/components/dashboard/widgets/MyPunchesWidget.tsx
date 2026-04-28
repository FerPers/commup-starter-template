import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_CFG, PUNCH_STYLE, TaskSection } from './_shared'

export default async function MyPunchesWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: myPunches } = await supabase
    .from('punches')
    .select(`id, punch_number, category, description, status, priority, target_date, project_id, projects(id, name, code), tags(tag_number)`)
    .eq('assigned_to', userId)
    .in('status', ['open', 'in_progress'])
    .order('target_date', { ascending: true, nullsFirst: false })

  const punchLabels: Record<string, string> = {
    open: t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    closed: t('punchStatus.closed'),
    cancelled: t('punchStatus.cancelled'),
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const items = myPunches ?? []

  return (
    <TaskSection title={t('inspector.myPunches')} count={items.length} emptyText={t('inspector.myPunchesEmpty')}>
      {items.map((p: any) => {
        const cat = CATEGORY_CFG[p.category as 'A' | 'B' | 'C']
        const pStyle = PUNCH_STYLE[p.status] ?? PUNCH_STYLE.open
        const overdue = p.target_date && p.target_date < todayStr
        return (
          <a key={p.id} href={`/projects/${p.project_id}/punches`} style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ padding: '14px 16px', background: 'var(--card-bg)', border: `1px solid ${overdue ? '#fecaca' : 'var(--border)'}`, borderLeft: `3px solid ${cat.color}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>{p.description}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', marginTop: 3 }}>{p.projects?.code} · {p.tags?.tag_number}</div>
              </div>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>{punchLabels[p.status] ?? p.status}</span>
            </div>
          </a>
        )
      })}
    </TaskSection>
  )
}
