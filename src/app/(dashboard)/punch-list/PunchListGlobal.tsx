'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bulkUpdatePunchStatus } from '@/app/actions/bulk'

const PAGE_SIZE = 50

type Project    = { id: string; name: string; code: string }
type Discipline = { id: string; code: string; name: string; color: string }

type Punch = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: 'critical' | 'major' | 'minor'
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  project_id: string
  raised_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
  projects: { id: string; name: string; code: string } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } } | null
}

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
} as const

const PUNCH_STYLE: Record<string, { color: string; bg: string }> = {
  open:        { color: '#ef4444', bg: '#fee2e2' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  closed:      { color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { color: '#64748b', bg: '#f1f5f9' },
}

const PUNCH_STATUS_KEYS = ['open', 'in_progress', 'closed', 'cancelled'] as const

const GRID = '36px 100px 70px 1fr 1fr 110px 90px 90px'

export default function PunchListGlobal({
  projects,
  punches,
  disciplines,
}: {
  projects: Project[]
  punches: Punch[]
  disciplines: Discipline[]
}) {
  const t  = useTranslations('PunchList')
  const tc = useTranslations('Common')

  const punchStatusLabels: Record<string, string> = {
    open:        t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    closed:      t('punchStatus.closed'),
    cancelled:   t('punchStatus.cancelled'),
  }

  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDisc, setFilterDisc] = useState('')
  const [page, setPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  const catACnt   = punches.filter(p => p.category === 'A' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catBCnt   = punches.filter(p => p.category === 'B' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catCCnt   = punches.filter(p => p.category === 'C' && p.status !== 'closed' && p.status !== 'cancelled').length
  const closedCnt = punches.filter(p => p.status === 'closed').length

  const filtered = useMemo(() => punches.filter(p => {
    if (filterProject && p.project_id !== filterProject) return false
    if (filterCat && p.category !== filterCat) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterDisc && p.tags?.disciplines.code !== filterDisc) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.punch_number.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !(p.tags?.tag_number ?? '').toLowerCase().includes(q) &&
        !(p.projects?.name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [punches, filterProject, filterCat, filterStatus, filterDisc, search])

  const hasFilters = filterProject || filterCat || filterStatus || filterDisc || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset selections when filters change
  useEffect(() => {
    setSelectedIds(new Set())
    setBulkError('')
  }, [filterProject, filterCat, filterStatus, filterDisc, search])

  // Indeterminate state on select-all checkbox
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0 && !allFilteredSelected
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkApply() {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkLoading(true)
    setBulkError('')
    const { error } = await bulkUpdatePunchStatus(Array.from(selectedIds), bulkStatus)
    setBulkLoading(false)
    if (error) { setBulkError(error); return }
    setSelectedIds(new Set())
    setBulkStatus('')
    router.refresh()
  }

  function exportCsv() {
    const headers = [
      t('exportHeaders.project'), t('exportHeaders.punch'), t('exportHeaders.category'),
      t('exportHeaders.description'), t('exportHeaders.tag'), t('exportHeaders.discipline'),
      t('exportHeaders.subsystem'), t('exportHeaders.raisedBy'), t('exportHeaders.assignedTo'),
      t('exportHeaders.targetDate'), t('exportHeaders.status'), t('exportHeaders.priority'),
    ]
    const rows = filtered.map(p => [
      p.projects?.code ?? '',
      p.punch_number,
      p.category,
      p.description,
      p.tags?.tag_number ?? '',
      p.tags?.disciplines?.code ?? '',
      p.subsystems?.code ?? '',
      p.raised_by_profile?.full_name ?? '',
      p.assigned_to_profile?.full_name ?? '',
      p.target_date ?? '',
      p.status,
      p.priority,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `punches_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summaryCards = [
    { labelKey: 'summary.catAOpen' as const, count: catACnt, color: '#ef4444', bg: '#fee2e2', cat: 'A' as const },
    { labelKey: 'summary.catBOpen' as const, count: catBCnt, color: '#f59e0b', bg: '#fffbeb', cat: 'B' as const },
    { labelKey: 'summary.catCOpen' as const, count: catCCnt, color: '#64748b', bg: '#f8fafc', cat: 'C' as const },
    { labelKey: 'summary.closed'   as const, count: closedCnt, color: '#10b981', bg: '#ecfdf5', cat: null },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {summaryCards.map(card => (
          <div
            key={card.labelKey}
            onClick={() => card.cat && setFilterCat(filterCat === card.cat ? '' : card.cat)}
            style={{
              padding: '14px 16px', borderRadius: '10px', cursor: card.cat ? 'pointer' : 'default',
              background: filterCat === card.cat ? card.bg : 'white',
              border: `1px solid ${filterCat === card.cat ? card.color + '40' : '#e2e8f0'}`,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{t(card.labelKey)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="">{tc('allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allStatuses')}</option>
          {PUNCH_STATUS_KEYS.map(k => <option key={k} value={k}>{punchStatusLabels[k]}</option>)}
        </select>
        <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(''); setFilterCat(''); setFilterStatus(''); setFilterDisc(''); setSearch(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            {tc('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: punches.length })}
        </span>
        {filtered.length > 0 && (
          <button
            onClick={exportCsv}
            style={{ padding: '7px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {tc('exportCsv')}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 16px', marginBottom: '8px',
          background: '#1e293b', borderRadius: '10px', color: 'white',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>
            {t('bulk.selected', { count: selectedIds.size })}
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{tc('changeStatusTo')}</span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">{tc('choose')}</option>
            {PUNCH_STATUS_KEYS.map(k => (
              <option key={k} value={k}>{punchStatusLabels[k]}</option>
            ))}
          </select>
          <button
            onClick={handleBulkApply}
            disabled={!bulkStatus || bulkLoading}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none',
              background: bulkStatus && !bulkLoading ? '#3b82f6' : '#334155',
              color: bulkStatus && !bulkLoading ? 'white' : '#64748b',
              fontSize: '12px', fontWeight: 600, cursor: bulkStatus && !bulkLoading ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {bulkLoading ? tc('applying') : tc('apply')}
          </button>
          {bulkError && <span style={{ fontSize: '12px', color: '#f87171' }}>{bulkError}</span>}
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); setBulkError('') }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}
            title={tc('deselectAll')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '12px', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center' }}>
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              title={allFilteredSelected ? tc('deselectAll') : t('filters.selectAll', { count: filtered.length })}
              style={{ cursor: 'pointer', accentColor: '#3b82f6', width: '15px', height: '15px' }}
            />
            <span>{t('table.colProject')}</span>
            <span>{t('table.colCat')}</span>
            <span>{t('table.colPunch')}</span>
            <span>{t('table.colDesc')}</span>
            <span>{t('table.colAssigned')}</span>
            <span>{t('table.colDue')}</span>
            <span>{t('table.colStatus')}</span>
          </div>

          {paginated.map(p => {
            const cat  = CATEGORY_CFG[p.category]
            const pStyle = PUNCH_STYLE[p.status] ?? PUNCH_STYLE.open
            const proj = p.projects
            const disc = p.tags?.disciplines
            const today = new Date().toISOString().slice(0, 10)
            const isOverdue = p.target_date && p.target_date < today && p.status !== 'closed' && p.status !== 'cancelled'
            const isSelected = selectedIds.has(p.id)

            return (
              <div
                key={p.id}
                style={{
                  display: 'grid', gridTemplateColumns: GRID, gap: '12px',
                  padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center',
                  background: isSelected ? '#eff6ff' : undefined,
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRow(p.id)}
                  style={{ cursor: 'pointer', accentColor: '#3b82f6', width: '15px', height: '15px' }}
                />

                {/* Project */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}/punches`}
                      title={proj.name}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* Category */}
                <div>
                  <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
                    {cat.label}
                  </span>
                </div>

                {/* Punch + Tag */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</div>
                  {p.tags && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {disc && <span style={{ fontSize: '9px', fontWeight: 700, color: disc.color, background: `${disc.color}15`, padding: '1px 4px', borderRadius: '3px' }}>{disc.code}</span>}
                      {p.tags.tag_number}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description}>
                  {p.description}
                </div>

                {/* Assigned */}
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.assigned_to_profile?.full_name ?? '—'}
                </div>

                {/* Due date */}
                <div style={{ fontSize: '11px', color: isOverdue ? '#ef4444' : '#64748b', fontWeight: isOverdue ? 600 : 400 }}>
                  {p.target_date ?? '—'}
                  {isOverdue && <span style={{ display: 'block', fontSize: '9px', color: '#ef4444' }}>{t('overdue')}</span>}
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>
                  {punchStatusLabels[p.status] ?? p.status}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 14px', background: page === 1 ? '#f8fafc' : 'white', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: page === 1 ? '#cbd5e1' : '#374151', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>{tc('prevPage')}</button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{tc('page', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 14px', background: page === totalPages ? '#f8fafc' : 'white', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: page === totalPages ? '#cbd5e1' : '#374151', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>{tc('nextPage')}</button>
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}