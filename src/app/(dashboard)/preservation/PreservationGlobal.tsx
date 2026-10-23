'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addDaysIso, browserToday } from '@/lib/time/zone'
import { ink } from '@/lib/theme'

const PAGE_SIZE = 50

type Project = { id: string; name: string; code: string }

type Plan = {
  id: string
  status: 'active' | 'suspended' | 'completed'
  start_date: string
  next_due_date: string
  last_performed_date: string | null
  project_id: string
  responsible_user_id: string | null
  projects: { id: string; name: string; code: string } | null
  tags: { id: string; tag_number: string; description: string } | null
  preservation_procedures: { id: string; code: string; title: string; frequency: string; interval_days: number } | null
}

const PLAN_STYLE: Record<string, { color: string; bg: string }> = {
  active:    { color: 'var(--success-700)', bg: 'var(--success-50)' },
  suspended: { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
  completed: { color: 'var(--text-muted)',  bg: 'var(--gray-100)' },
}

export default function PreservationGlobal({
  projects,
  plans,
  projectScope,
  userId,
}: {
  projects: Project[]
  plans: Plan[]
  /** Teléfono: «A mi cargo» = planes de los que soy responsable. */
  userId: string
  /** H-08 (S08): vista del proyecto — sin selector de proyecto. */
  projectScope?: Project
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
    if (diffDays < 0) return { label: t('due.overdue', { days: Math.abs(diffDays) }), color: 'var(--danger-700)', bg: 'var(--danger-100)' }
    if (diffDays <= 7) return { label: t('due.soon', { days: diffDays }), color: 'var(--warning-700)', bg: 'var(--warning-50)' }
    return { label: nextDue, color: 'var(--text-muted)', bg: 'transparent' }
  }

  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState(projectScope?.id ?? '')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDue, setFilterDue] = useState<'overdue' | 'soon' | ''>('')
  const [page, setPage] = useState(1)

  // Lazy initial state: pinned to mount time so the wall clock isn't read every render
  const [{ today, soon }] = useState(() => {
    // S10 (G-13): día del navegador, no de UTC
    const today = browserToday()
    return { today, soon: addDaysIso(today, 7) }
  })

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

  const hasFilters = (!projectScope && filterProject) || filterStatus || filterDue || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const planStatusKeys = ['active', 'suspended', 'completed'] as const

  // Teléfono (backlog 3, 2026-10-23): tarjetas por vencimiento; «A mi cargo» por defecto si tengo planes
  const mineCount = plans.filter(p => p.responsible_user_id === userId).length
  const [mineOnly, setMineOnly] = useState(mineCount > 0)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE_SIZE)
  const phonePlans = filtered.filter(p => !mineOnly || p.responsible_user_id === userId)
  const groups = [
    { key: 'overdue', title: t('mobile.groupOverdue'), tone: 'var(--danger-700)', items: phonePlans.filter(p => p.status === 'active' && p.next_due_date < today) },
    { key: 'soon', title: t('mobile.groupSoon'), tone: 'var(--warning-700)', items: phonePlans.filter(p => p.status === 'active' && p.next_due_date >= today && p.next_due_date <= soon) },
    { key: 'ok', title: t('mobile.groupOk'), tone: 'var(--text-secondary)', items: phonePlans.filter(p => p.status === 'active' && p.next_due_date > soon) },
    { key: 'other', title: t('mobile.groupOther'), tone: 'var(--text-secondary)', items: phonePlans.filter(p => p.status !== 'active') },
  ] as const
  const card = (plan: Plan, urgent: boolean) => {
    const due = dueDateStatus(plan.next_due_date)
    const proc = plan.preservation_procedures
    return (
      <li key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--card-bg)', border: `1px solid ${urgent ? 'var(--danger-200)' : 'var(--border)'}`, borderRadius: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {plan.tags
              ? <Link href={`/projects/${plan.project_id}/tags/${plan.tags.id}?tab=preservation`} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 15, color: 'var(--text-strong)', textDecoration: 'none' }}>{plan.tags.tag_number}</Link>
              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            {!projectScope && plan.projects && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-700)' }}>{plan.projects.code}</span>}
          </span>
          {proc && <span style={{ fontSize: 13, color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc.code} · {proc.title}</span>}
          <span style={{ fontSize: 12, fontWeight: plan.status === 'active' && due.bg !== 'transparent' ? 600 : 400, color: plan.status === 'active' ? ink(due.color) : 'var(--text-muted)' }}>
            {proc ? `${freqLabels[proc.frequency] ?? proc.frequency} · ` : ''}{plan.status === 'active' ? due.label : planStatusLabels[plan.status]}
          </span>
        </div>
        {plan.tags && plan.status === 'active' && (
          <Link href={`/projects/${plan.project_id}/tags/${plan.tags.id}/preservation/${plan.id}`}
            style={{ height: 44, padding: '0 16px', borderRadius: 10, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, textDecoration: 'none', flexShrink: 0,
              background: urgent ? 'var(--primary-600)' : 'var(--primary-50)', color: urgent ? '#fff' : 'var(--primary-700)', border: urgent ? 'none' : '1px solid var(--primary-200)' }}>
            {t('table.execute')}
          </Link>
        )}
      </li>
    )
  }

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
          <p className="desk-only" style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{projectScope ? `${projectScope.code} — ${projectScope.name}` : tc('allOrg')}</p>
          <p className="phone-only" style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{t('mobile.summary', { overdue: overdueCnt, soon: soonCnt, active: activeCnt })}</p>
        </div>
        <a
          href="/preservation/pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
            textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
          }}
        >
          {t('exportPdf')}
        </a>
      </div>

      {/* Teléfono: A mi cargo / Todos, buscador y tarjetas por vencimiento */}
      <div className="phone-only" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div role="group" aria-label={t('mobile.scope')} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, padding: 4, background: 'var(--gray-100)', borderRadius: 12 }}>
          {([true, false] as const).map(mine => (
            <button key={String(mine)} type="button" aria-pressed={mineOnly === mine} onClick={() => { setMineOnly(mine); setShown(PAGE_SIZE) }}
              style={{ height: 40, border: 0, borderRadius: 9, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
                background: mineOnly === mine ? 'var(--card-bg)' : 'transparent', color: mineOnly === mine ? 'var(--text-strong)' : 'var(--text-secondary)', fontWeight: mineOnly === mine ? 700 : 400 }}>
              {mine ? t('mobile.mine', { count: mineCount }) : t('mobile.all', { count: plans.length })}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE_SIZE) }} placeholder={t('filters.search')} aria-label={t('filters.search')}
          style={{ height: 44, boxSizing: 'border-box', padding: '0 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 16, fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-strong)' }} />
        {phonePlans.length === 0 && (
          <p style={{ textAlign: 'center', padding: '32px 12px', margin: 0, fontSize: 14, color: 'var(--text-muted)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>{t('empty')}</p>
        )}
        {groups.map(g => {
          if (g.items.length === 0) return null
          const collapsible = g.key === 'ok' || g.key === 'other'
          const open = !collapsible || openGroups.has(g.key)
          return (
            <section key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {collapsible ? (
                <button type="button" onClick={() => setOpenGroups(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })} aria-expanded={open}
                  style={{ height: 48, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg)', color: 'var(--text-body)', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span>{g.title} · {g.items.length}</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
                </button>
              ) : (
                <h2 style={{ margin: '6px 2px 0', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: g.tone }}>{g.title} · {g.items.length}</h2>
              )}
              {open && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.slice(0, shown).map(p => card(p, g.key === 'overdue'))}
                </ul>
              )}
              {open && g.items.length > shown && (
                <button type="button" onClick={() => setShown(n => n + PAGE_SIZE)} style={{ height: 44, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-bg)', color: 'var(--primary-700)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {t('mobile.showMore', { count: g.items.length - shown })}
                </button>
              )}
            </section>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="desk-only" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
        <button
          type="button"
          aria-pressed={filterDue === 'overdue'}
          onClick={() => setFilterDue(filterDue === 'overdue' ? '' : 'overdue')}
          style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'overdue' ? 'var(--danger-100)' : 'var(--card-bg)', border: `1px solid ${filterDue === 'overdue' ? '#fca5a540' : 'var(--border)'}` }}
        >
          <span style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: 'var(--danger-700)' }}>{overdueCnt}</span>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.overdue')}</span>
        </button>
        <button
          type="button"
          aria-pressed={filterDue === 'soon'}
          onClick={() => setFilterDue(filterDue === 'soon' ? '' : 'soon')}
          style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'soon' ? 'var(--warning-50)' : 'var(--card-bg)', border: `1px solid ${filterDue === 'soon' ? 'var(--warning-200)' : 'var(--border)'}` }}
        >
          <span style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: 'var(--warning-700)' }}>{soonCnt}</span>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.dueSoon')}</span>
        </button>
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success-700)' }}>{activeCnt}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('summary.active')}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="desk-only" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        {!projectScope && (
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
            <option value="">{tc('allProjects')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        )}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allStatuses')}</option>
          {planStatusKeys.map(k => <option key={k} value={k}>{planStatusLabels[k]}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(projectScope?.id ?? ''); setFilterStatus(''); setFilterDue(''); setSearch(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {tc('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: plans.length })}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="desk-only" style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{t('empty')}</p>
        </div>
      ) : (
        <div className="desk-only" style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
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
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px 110px 110px 90px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--gray-50)', alignItems: 'center' }}
              >
                {/* Project */}
                <div>
                  {proj && (
                    <Link
                      href={`/projects/${proj.id}`}
                      title={proj.name}
                      style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </Link>
                  )}
                </div>

                {/* Tag */}
                <div>
                  {/* H-08 (S08): la fila lleva al tag y a ejecutar el plan */}
                  {plan.tags ? (
                    <Link href={`/projects/${plan.project_id}/tags/${plan.tags.id}?tab=preservation`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}>
                      {plan.tags.tag_number}
                    </Link>
                  ) : <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</div>}
                  {plan.tags && plan.status === 'active' && (
                    <Link href={`/projects/${plan.project_id}/tags/${plan.tags.id}/preservation/${plan.id}`} style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--primary-700)', textDecoration: 'none' }}>
                      {t('table.execute')} →
                    </Link>
                  )}
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
                <div style={{ fontSize: '11px', fontWeight: 500, color: ink(plan.status === 'active' ? due.color : 'var(--text-muted)'), background: plan.status === 'active' ? due.bg : 'transparent', padding: due.bg !== 'transparent' ? '2px 6px' : '0', borderRadius: '4px', display: 'inline-block' }}>
                  {plan.status === 'active' ? due.label : plan.next_due_date}
                </div>

                {/* Last record */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {plan.last_performed_date ?? '—'}
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: pStyle.bg, color: ink(pStyle.color), whiteSpace: 'nowrap' }}>
                  {planStatusLabels[plan.status] ?? plan.status}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="desk-only" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 14px', background: page === 1 ? 'var(--gray-50)' : 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: page === 1 ? 'var(--text-muted)' : 'var(--text-body)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>{tc('prevPage')}</button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tc('page', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 14px', background: page === totalPages ? 'var(--gray-50)' : 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: page === totalPages ? 'var(--text-muted)' : 'var(--text-body)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>{tc('nextPage')}</button>
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-body)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}