import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { ITR_STYLE, TaskSection } from './_shared'

export default async function MyItrsWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: myAssignments } = await supabase
    .from('itr_assignments')
    .select(`id, role, itrs(id, itr_number, status, progress_pct, scheduled_date, project_id, tags(id, tag_number, description), projects(id, name, code), project_phases(code, color, name))`)
    .eq('user_id', userId)

  const itrLabels: Record<string, string> = {
    not_started: t('itrStatus.not_started'),
    in_progress: t('itrStatus.in_progress'),
    completed: t('itrStatus.completed'),
    approved: t('itrStatus.approved'),
    rejected: t('itrStatus.rejected'),
  }

  type ItrFull = {
    id: string
    itr_number: string
    status: string
    progress_pct: number
    scheduled_date: string | null
    project_id: string
    tags: { id: string; tag_number: string; description: string | null } | null
    projects: { id: string; name: string; code: string } | null
    project_phases: { code: string; color: string; name: string } | null
  } | null
  const seen = new Set<string>()
  const activeItrs = (myAssignments ?? [])
    .filter(a => {
      const itr = a.itrs as unknown as ItrFull
      if (!itr || ['approved', 'rejected'].includes(itr.status)) return false
      if (seen.has(itr.id)) return false
      seen.add(itr.id)
      return true
    })
    .sort((a, b) => {
      const da = (a.itrs as unknown as ItrFull)?.scheduled_date ?? '9999'
      const db = (b.itrs as unknown as ItrFull)?.scheduled_date ?? '9999'
      return da.localeCompare(db)
    })

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <TaskSection title={t('inspector.myItrs')} count={activeItrs.length} emptyText={t('inspector.myItrsEmpty')}>
      {activeItrs.map(a => {
        const itr = a.itrs as unknown as ItrFull
        if (!itr) return null
        const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
        const phase = itr.project_phases
        const overdue = itr.scheduled_date && itr.scheduled_date < todayStr && itr.status === 'not_started'
        return (
          <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ padding: '14px 16px', background: 'var(--card-bg)', border: `1px solid ${overdue ? '#fecaca' : 'var(--border)'}`, borderLeft: `3px solid ${overdue ? 'var(--danger-500)' : style.color}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>}
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
                    {a.role === 'executor' ? t('inspector.executor') : a.role === 'supervisor' ? t('inspector.supervisor') : t('inspector.roleClient')}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>{itr.tags?.tag_number} — {itr.tags?.description}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', marginTop: 3, display: 'flex', gap: 10 }}>
                  <span>{itr.projects?.code}</span>
                  {itr.scheduled_date && (
                    <span style={{ color: overdue ? 'var(--danger-500)' : 'var(--gray-400)', fontWeight: overdue ? 600 : 400 }}>
                      {t(overdue ? 'inspector.schedOverdue' : 'inspector.scheduled', { date: itr.scheduled_date })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>{itrLabels[itr.status] ?? itr.status}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 60, height: 4, background: 'var(--gray-100)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{itr.progress_pct}%</span>
                </div>
              </div>
            </div>
          </a>
        )
      })}
    </TaskSection>
  )
}
