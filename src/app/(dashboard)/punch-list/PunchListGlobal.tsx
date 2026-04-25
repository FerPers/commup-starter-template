'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X, Download } from 'lucide-react'
import { Button, Input, Select, EmptyState } from '@/components/ui'
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
  A: { label: 'Cat A', color: 'var(--danger-500)',  bg: 'var(--danger-50)',  border: '#fecaca' },
  B: { label: 'Cat B', color: 'var(--warning-500)', bg: 'var(--warning-50)', border: '#fde68a' },
  C: { label: 'Cat C', color: 'var(--gray-500)',    bg: 'var(--gray-50)',    border: 'var(--border)' },
} as const

const PUNCH_STYLE: Record<string, { color: string; bg: string }> = {
  open:        { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  closed:      { color: 'var(--success-500)', bg: 'var(--success-50)' },
  cancelled:   { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
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
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `punches_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summaryCards = [
    { labelKey: 'summary.catAOpen' as const, count: catACnt, color: 'var(--danger-500)',  bg: 'var(--danger-50)',  cat: 'A' as const },
    { labelKey: 'summary.catBOpen' as const, count: catBCnt, color: 'var(--warning-500)', bg: 'var(--warning-50)', cat: 'B' as const },
    { labelKey: 'summary.catCOpen' as const, count: catCCnt, color: 'var(--gray-500)',    bg: 'var(--gray-50)',    cat: 'C' as const },
    { labelKey: 'summary.closed'   as const, count: closedCnt, color: 'var(--success-500)', bg: 'var(--success-50)', cat: null },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 1300 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {summaryCards.map(card => {
          const active = card.cat && filterCat === card.cat
          return (
            <button
              key={card.labelKey}
              onClick={() => card.cat && setFilterCat(filterCat === card.cat ? '' : card.cat)}
              aria-pressed={!!active}
              disabled={!card.cat}
              style={{
                padding: '14px 16px', borderRadius: 'var(--radius-md)',
                cursor: card.cat ? 'pointer' : 'default',
                background: active ? card.bg : 'var(--card-bg)',
                border: `1px solid ${active ? `${card.color}40` : 'var(--border)'}`,
                transition: 'background 0.15s, border-color 0.15s',
                textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.count}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{t(card.labelKey)}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          inputSize="sm"
          fullWidth={false}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          leftIcon={<Search size={14} />}
          wrapperStyle={{ width: 260 }}
        />
        <Select selectSize="sm" fullWidth={false} value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ width: 200 }}>
          <option value="">{tc('allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
          <option value="">{t('filters.allStatuses')}</option>
          {PUNCH_STATUS_KEYS.map(k => <option key={k} value={k}>{punchStatusLabels[k]}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filterDisc} onChange={(e) => setFilterDisc(e.target.value)} style={{ width: 180 }}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </Select>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFilterProject(''); setFilterCat(''); setFilterStatus(''); setFilterDisc(''); setSearch(''); setPage(1) }}
          >
            {tc('clearFilters')}
          </Button>
        )}
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: punches.length })}
        </span>
        {filtered.length > 0 && (
          <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={exportCsv}>
            {tc('exportCsv')}
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', marginBottom: 8,
          background: 'var(--gray-800)', borderRadius: 'var(--radius-md)', color: '#fff',
        }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            {t('bulk.selected', { count: selectedIds.size })}
          </span>
          <span style={{ color: 'var(--gray-600)' }}>|</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)' }}>{tc('changeStatusTo')}</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--gray-700)', background: 'var(--gray-900)',
              color: '#fff', fontSize: 'var(--text-sm)',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            <option value="">{tc('choose')}</option>
            {PUNCH_STATUS_KEYS.map(k => (
              <option key={k} value={k}>{punchStatusLabels[k]}</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleBulkApply}
            disabled={!bulkStatus || bulkLoading}
            loading={bulkLoading}
          >
            {tc('apply')}
          </Button>
          {bulkError && <span style={{ fontSize: 'var(--text-sm)', color: '#f87171' }}>{bulkError}</span>}
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); setBulkError('') }}
            aria-label={tc('deselectAll')}
            title={tc('deselectAll')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', padding: '0 4px', display: 'inline-flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <EmptyState title={t('empty')} />
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center' }}>
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              title={allFilteredSelected ? tc('deselectAll') : t('filters.selectAll', { count: filtered.length })}
              style={{ cursor: 'pointer', accentColor: 'var(--primary-500)', width: 15, height: 15 }}
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
                  display: 'grid', gridTemplateColumns: GRID, gap: 12,
                  padding: '12px 16px', borderBottom: '1px solid var(--gray-50)', alignItems: 'center',
                  background: isSelected ? 'var(--primary-50)' : undefined,
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRow(p.id)}
                  style={{ cursor: 'pointer', accentColor: 'var(--primary-500)', width: 15, height: 15 }}
                />

                {/* Project */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}/punches`}
                      title={proj.name}
                      style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-500)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', display: 'inline-block', maxWidth: 94, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* Category */}
                <div>
                  <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
                    {cat.label}
                  </span>
                </div>

                {/* Punch + Tag */}
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</div>
                  {p.tags && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {disc && <span style={{ fontSize: 9, fontWeight: 700, color: disc.color, background: `${disc.color}15`, padding: '1px 4px', borderRadius: 3 }}>{disc.code}</span>}
                      {p.tags.tag_number}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description}>
                  {p.description}
                </div>

                {/* Assigned */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.assigned_to_profile?.full_name ?? '—'}
                </div>

                {/* Due date */}
                <div style={{ fontSize: 'var(--text-xs)', color: isOverdue ? 'var(--danger-500)' : 'var(--text-muted)', fontWeight: isOverdue ? 600 : 400 }}>
                  {p.target_date ?? '—'}
                  {isOverdue && <span style={{ display: 'block', fontSize: 9, color: 'var(--danger-500)' }}>{t('overdue')}</span>}
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600, background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>
                  {punchStatusLabels[p.status] ?? p.status}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20, alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>{tc('prevPage')}</Button>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{tc('page', { page, total: totalPages })}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{tc('nextPage')}</Button>
        </div>
      )}
    </div>
  )
}
