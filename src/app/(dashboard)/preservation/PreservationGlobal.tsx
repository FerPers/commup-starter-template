'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

const PAGE_SIZE = 50

type Project = { id: string; name: string; code: string }

type Plan = {
  id: string
  status: 'active' | 'suspended' | 'completed'
  start_date: string
  next_due_date: string
  last_performed_date: string | null
  project_id: string
  projects: { id: string; name: string; code: string } | null
  tags: { id: string; tag_number: string; description: string } | null
  preservation_procedures: { id: string; code: string; title: string; frequency: string; interval_days: number } | null
}

const PLAN_STYLE: Record<string, { color: string; bg: string }> = {
  active:    { color: '#10b981', bg: '#ecfdf5' },
  suspended: { color: '#f59e0b', bg: '#fffbeb' },
  completed: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
}

export default function PreservationGlobal({
  projects,
  plans,
}: {
  projects: Project[]
  plans: Plan[]
}) {
  const t  = useTranslations('Preservation')
  const tc = useTranslations('Common')

  const planStatusLabels: Record<string, string> = {
    active:    t('planStatus.active'),
    suspended: t('planStatus.suspended'),
    completed: t('planStatus.completed'),
  }

  const freqLabels: Record<string, string> = {
    daily:     t('freq.daily'),
    weekly:    t('freq.weekly'),
    biweekly:  t('freq.biweekly'),
    monthly:   t('freq.monthly'),
    quarterly: t('freq.quarterly'),
  }

  function dueDateStatus(nextDue: string) {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const due = new Date(nextDue)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { label: t('due.overdue', { days: Math.abs(diffDays) }), color: '#ef4444', bg: '#fee2e2' }
    if (diffDays <= 7) return { label: t('due.soon', { days: diffDays }), color: '#f59e0b', bg: '#fffbeb' }
    return { label: nextDue, color: 'var(--text-muted)', bg: 'transparent' }
  }

  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDue, setFilterDue] = useState<'overdue' | 'soon' | ''>('')
  const [page, setPage] = useState(1)

  const today = new Date().toISOString().slice(0, 10)
  const soon  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const overdueCnt = plans.filter(p => p.status === 'active' && p.next_due_date < today).length
  const soonCnt    = plans.filter(p => p.status === 'active' && p.next_due_date >= today && p.next_due_date <= soon).length
  const activeCnt  = plans.filter(p => p.status === 'active').length

  const filtered = useMemo(() => plans.filter(p => {
    if (filterProject && p.project_id !== filterProject) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterDue === 'overdue' && !(p.status === 'active' && p.next_due_date < today)) return false
    if (filterDue === 'soon' && !(p.status === 'active' && p.next_due_date >= today && p.next_due_date <= soon)) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !(p.tags?.tag_number ?? '').toLowerCase().includes(q) &&
        !(p.preservation_procedures?.title ?? '').toLowerCase().includes(q) &&
        !(p.projects?.name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [plans, filterProject, filterStatus, filterDue, search, today, soon])

  const hasFilters = filterProject || filterStatus || filterDue || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const planStatusKeys = ['active', 'suspended', 'completed'] as const

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
        <div
          onClick={() => setFilterDue(filterDue === 'overdue' ? '' : 'overdue')}
          style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'overdue' ? '#fee2e2' : 'var(--card-bg)', border: `1px solid ${filterDue === 'overdue' ? '#fca5a540' : 'var(--border)'}` }}
        >
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#ef4444' }}>{overdueCnt}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.overdue')}</div>
        </div>
        <div
          onClick={() => setFilterDue(filterDue === 'soon' ? '' : 'soon')}
          style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'soon' ? '#fffbeb' : 'var(--card-bg)', border: `1px solid ${filterDue === 'soon' ? '#fde68a' : 'var(--border)'}` }}
        >
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>{soonCnt}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.dueSoon')}</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{activeCnt}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.active')}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="">{tc('allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allStatuses')}</option>
          {planStatusKeys.map(k => <option key={k} value={k}>{planStatusLabels[k]}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(''); setFilterStatus(''); setFilterDue(''); setSearch(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {tc('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: plans.length })}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: 'var(--gray-400)' }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px 110px 110px 90px', gap: '12px', padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>{t('table.colProject')}</span>
            <span>{t('table.colTag')}</span>
            <span>{t('table.colProcedure')}</span>
            <span>{t('table.colFreq')}</span>
            <span>{t('table.colNextDue')}</span>
            <span>{t('table.colLastRecord')}</span>
            <span>{t('table.colStatus')}</span>
          </div>

          {paginated.map(plan => {
            const pStyle = PLAN_STYLE[plan.status]
            const due    = dueDateStatus(plan.next_due_date)
            const proc   = plan.preservation_procedures
            const proj   = plan.projects

            return (
              <div
                key={plan.id}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px 110px 110px 90px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}
              >
                {/* Project */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}`}
                      title={proj.name}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* Tag */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                    {plan.tags?.tag_number ?? '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {plan.tags?.description ?? ''}
                  </div>
                </div>

                {/* Procedure */}
                <div>
                  {proc && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{proc.code}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{proc.title}</div>
                    </>
                  )}
                </div>

                {/* Frequency */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {proc ? (freqLabels[proc.frequency] ?? proc.frequency) : '—'}
                </div>

                {/* Next due */}
                <div style={{ fontSize: '11px', fontWeight: 500, color: plan.status === 'active' ? due.color : 'var(--gray-400)', background: plan.status === 'active' ? due.bg : 'transparent', padding: due.bg !== 'transparent' ? '2px 6px' : '0', borderRadius: '4px', display: 'inline-block' }}>
                  {plan.status === 'active' ? due.label : plan.next_due_date}
                </div>

                {/* Last record */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {plan.last_performed_date ?? '—'}
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>
                  {planStatusLabels[plan.status] ?? plan.status}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 14px', background: page === 1 ? 'var(--gray-50)' : 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: page === 1 ? 'var(--gray-300)' : '#374151', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>{tc('prevPage')}</button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tc('page', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 14px', background: page === totalPages ? 'var(--gray-50)' : 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: page === totalPages ? 'var(--gray-300)' : '#374151', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>{tc('nextPage')}</button>
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--gray-700)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}