'use client'

import { useState, useMemo, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X, Download } from 'lucide-react'
import { Button, Input, Select, EmptyState, DataTable, type DataTableColumn } from '@/components/ui'
import { bulkUpdatePunchStatus, bulkDeletePunches } from '@/app/actions/bulk'
import { reassignPunch } from '@/app/actions/punches'

const PAGE_SIZE = 50
const REASSIGN_ROLES = ['owner', 'admin', 'architect', 'leader']
const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

type Project    = { id: string; name: string; code: string }
type Discipline = { id: string; code: string; name: string; color: string }
type OrgMember  = { user_id: string; profiles: { full_name: string } | null }

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
  assigned_to: string | null
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

export default function PunchListGlobal({
  projects,
  punches,
  disciplines,
  orgMembers,
  currentUserRole,
}: {
  projects: Project[]
  punches: Punch[]
  disciplines: Discipline[]
  orgMembers: OrgMember[]
  currentUserRole: string
}) {
  const t  = useTranslations('PunchList')
  const tc = useTranslations('Common')
  const tTags = useTranslations('Tags')
  const canReassign = REASSIGN_ROLES.includes(currentUserRole)
  const canDelete = EDITOR_ROLES.includes(currentUserRole)
  const [reassignPunchRow, setReassignPunchRow] = useState<Punch | null>(null)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Bulk selection must reset when filters narrow the list to avoid acting on items no longer visible
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

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(t('bulk.deleteConfirm', { count: selectedIds.size }))) return
    setBulkLoading(true)
    setBulkError('')
    const { error } = await bulkDeletePunches(Array.from(selectedIds))
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
          aria-label={t('filters.search')}
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
        <a
          href="/punch-list/export"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', height: 28,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)', fontWeight: 500,
            color: 'var(--text-strong)', textDecoration: 'none',
            background: 'transparent', whiteSpace: 'nowrap',
          }}
        >
          <Download size={14} />
          {t('exportExcel')}
        </a>
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
          {canDelete && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                background: '#dc2626', border: '1px solid #b91c1c',
                color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600,
                fontFamily: 'inherit', cursor: bulkLoading ? 'default' : 'pointer',
                opacity: bulkLoading ? 0.6 : 1,
              }}
            >
              {t('bulk.delete')}
            </button>
          )}
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
      <DataTable<Punch>
        rows={paginated}
        rowKey={(p) => p.id}
        responsive="stack"
        ariaLabel={t('title')}
        empty={<EmptyState title={t('empty')} />}
        rowStyle={(p) => selectedIds.has(p.id) ? { background: 'var(--primary-50)' } : undefined}
        columns={[
          {
            key: 'select',
            width: 36,
            sticky: 'left',
            hideBelow: 768,
            header: (
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                title={allFilteredSelected ? tc('deselectAll') : t('filters.selectAll', { count: filtered.length })}
                style={{ cursor: 'pointer', accentColor: 'var(--primary-500)', width: 15, height: 15 }}
              />
            ),
            cell: (p) => (
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleRow(p.id)}
                style={{ cursor: 'pointer', accentColor: 'var(--primary-500)', width: 15, height: 15 }}
              />
            ),
          },
          {
            key: 'project',
            width: 100,
            header: t('table.colProject'),
            cell: (p) => p.projects ? (
              <a
                href={`/projects/${p.projects.id}/punches`}
                title={p.projects.name}
                style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-500)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', display: 'inline-block', maxWidth: 94, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {p.projects.code}
              </a>
            ) : null,
          },
          {
            key: 'category',
            width: 70,
            header: t('table.colCat'),
            cell: (p) => {
              const cat = CATEGORY_CFG[p.category]
              return (
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
                  {cat.label}
                </span>
              )
            },
          },
          {
            key: 'punch',
            header: t('table.colPunch'),
            cell: (p) => {
              const disc = p.tags?.disciplines
              return (
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</div>
                  {p.tags && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {disc && <span style={{ fontSize: 9, fontWeight: 700, color: disc.color, background: `${disc.color}15`, padding: '1px 4px', borderRadius: 3 }}>{disc.code}</span>}
                      {p.tags.tag_number}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'desc',
            header: t('table.colDesc'),
            cell: (p) => (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} title={p.description}>
                {p.description}
              </div>
            ),
          },
          {
            key: 'assigned',
            width: 130,
            hideBelow: 1024,
            header: t('table.colAssigned'),
            cell: (p) => (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.assigned_to_profile?.full_name ?? '—'}
              </div>
            ),
          },
          {
            key: 'due',
            width: 100,
            header: t('table.colDue'),
            cell: (p) => {
              const today = new Date().toISOString().slice(0, 10)
              const isOverdue = !!(p.target_date && p.target_date < today && p.status !== 'closed' && p.status !== 'cancelled')
              return (
                <div style={{ fontSize: 'var(--text-xs)', color: isOverdue ? 'var(--danger-500)' : 'var(--text-muted)', fontWeight: isOverdue ? 600 : 400 }}>
                  {p.target_date ?? '—'}
                  {isOverdue && <span style={{ display: 'block', fontSize: 9, color: 'var(--danger-500)' }}>{t('overdue')}</span>}
                </div>
              )
            },
          },
          {
            key: 'status',
            width: 100,
            header: t('table.colStatus'),
            cell: (p) => {
              const pStyle = PUNCH_STYLE[p.status] ?? PUNCH_STYLE.open
              return (
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600, background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>
                  {punchStatusLabels[p.status] ?? p.status}
                </span>
              )
            },
          },
          ...(canReassign ? [{
            key: 'actions',
            width: 110,
            header: '',
            cell: (p: Punch) => {
              const isClosed = p.status === 'closed' || p.status === 'cancelled'
              if (isClosed) return null
              return (
                <button
                  onClick={() => setReassignPunchRow(p)}
                  title={tTags('punches.detail.labelReassign')}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--card-bg)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tTags('punches.detail.reassignBtn')}
                </button>
              )
            },
          }] : []),
        ] satisfies DataTableColumn<Punch>[]}
      />

      {reassignPunchRow && (
        <GlobalReassignModal
          punch={reassignPunchRow}
          orgMembers={orgMembers}
          onClose={() => setReassignPunchRow(null)}
          onDone={() => { setReassignPunchRow(null); router.refresh() }}
        />
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

function GlobalReassignModal({
  punch,
  orgMembers,
  onClose,
  onDone,
}: {
  punch: Punch
  orgMembers: OrgMember[]
  onClose: () => void
  onDone: () => void
}) {
  const tTags = useTranslations('Tags')
  const [reassignTo, setReassignTo] = useState<string>(punch.assigned_to ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const reassignDirty = (reassignTo || null) !== (punch.assigned_to ?? null)

  function handleConfirm() {
    if (!reassignDirty) return
    setError(null)
    startTransition(async () => {
      const res = await reassignPunch({
        punchId: punch.id,
        projectId: punch.project_id,
        tagId: punch.tags?.id ?? null,
        newAssignee: reassignTo || null,
      })
      if (res.error) { setError(res.error); return }
      onDone()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{punch.punch_number}</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-strong)', margin: 0, lineHeight: 1.4 }}>{tTags('punches.detail.labelReassign')}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--gray-400)', cursor: 'pointer' }}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.4 }}>{punch.description}</p>

        <select
          value={reassignTo}
          onChange={e => setReassignTo(e.target.value)}
          disabled={isPending}
          style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--card-bg)', fontFamily: 'inherit', marginBottom: 16 }}
        >
          <option value="">{tTags('punches.detail.reassignPlaceholder')}</option>
          {orgMembers.map(m => (
            <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name ?? m.user_id}</option>
          ))}
        </select>

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: 6, margin: '0 0 12px' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || !reassignDirty}
            style={{
              padding: '8px 16px',
              background: reassignDirty && !isPending ? 'var(--primary-500)' : 'var(--gray-100)',
              color: reassignDirty && !isPending ? '#fff' : 'var(--gray-400)',
              border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
              cursor: reassignDirty && !isPending ? 'pointer' : 'default',
            }}
          >
            {isPending ? tTags('punches.detail.reassignSubmitting') : tTags('punches.detail.reassignBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
