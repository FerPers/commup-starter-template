'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X, Download } from 'lucide-react'
import { Button, Input, Select, EmptyState, DataTable, type DataTableColumn } from '@/components/ui'
import { bulkUpdateItrStatus } from '@/app/actions/bulk'

const PAGE_SIZE = 50

type Project = { id: string; name: string; code: string }

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  project_id: string
  projects: { id: string; name: string; code: string } | null
  itr_templates: { code: string; title: string; disciplines: { code: string; name: string; color: string } } | null
  tags: { id: string; tag_number: string; description: string } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_signatures: Array<{ role: string; signed_at: string }>
}

type Phase = { id: string; code: string; name: string; color: string; order_index: number }

const ITR_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-500)', bg: 'var(--success-50)' },
  approved:    { color: '#7c3aed',            bg: '#f5f3ff' },
  rejected:    { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
}

const ITR_STATUS_KEYS = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const

const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }

export default function ItrListGlobal({
  projects,
  itrs,
  phases,
}: {
  projects: Project[]
  itrs: ItrRow[]
  phases: Phase[]
}) {
  const t  = useTranslations('ItrList')
  const tc = useTranslations('Common')

  const itrStatusLabels: Record<string, string> = {
    not_started: t('itrStatus.not_started'),
    in_progress: t('itrStatus.in_progress'),
    completed:   t('itrStatus.completed'),
    approved:    t('itrStatus.approved'),
    rejected:    t('itrStatus.rejected'),
  }

  const router = useRouter()
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPhase, setFilterPhase] = useState('')
  const [filterDisc, setFilterDisc] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  const disciplines = useMemo(() => {
    const seen = new Set<string>()
    const list: { code: string; name: string; color: string }[] = []
    for (const itr of itrs) {
      const d = itr.itr_templates?.disciplines
      if (d && !seen.has(d.code)) { seen.add(d.code); list.push(d) }
    }
    return list.sort((a, b) => a.code.localeCompare(b.code))
  }, [itrs])

  const filtered = useMemo(() => {
    return itrs.filter(itr => {
      if (filterProject && itr.project_id !== filterProject) return false
      if (filterStatus && itr.status !== filterStatus) return false
      if (filterPhase && itr.project_phases?.code !== filterPhase) return false
      if (filterDisc && itr.itr_templates?.disciplines?.code !== filterDisc) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !itr.itr_number.toLowerCase().includes(q) &&
          !(itr.tags?.tag_number ?? '').toLowerCase().includes(q) &&
          !(itr.itr_templates?.title ?? '').toLowerCase().includes(q) &&
          !(itr.projects?.name ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [itrs, filterStatus, filterPhase, filterDisc, filterProject, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const itr of itrs) c[itr.status] = (c[itr.status] ?? 0) + 1
    return c
  }, [itrs])

  const hasFilters = filterStatus || filterPhase || filterDisc || filterProject || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset selections when filters change
  useEffect(() => {
    setSelectedIds(new Set())
    setBulkError('')
  }, [filterStatus, filterPhase, filterDisc, filterProject, search])

  // Indeterminate state on select-all checkbox
  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))
  const someSelected = selectedIds.size > 0 && !allFilteredSelected
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)))
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
    const { error } = await bulkUpdateItrStatus(Array.from(selectedIds), bulkStatus)
    setBulkLoading(false)
    if (error) { setBulkError(error); return }
    setSelectedIds(new Set())
    setBulkStatus('')
    router.refresh()
  }

  function exportCsv() {
    const headers = [
      t('exportHeaders.project'), t('exportHeaders.itr'), t('exportHeaders.tag'),
      t('exportHeaders.tagDesc'), t('exportHeaders.template'), t('exportHeaders.phase'),
      t('exportHeaders.discipline'), t('exportHeaders.inspector'), t('exportHeaders.scheduledDate'),
      t('exportHeaders.progress'), t('exportHeaders.status'),
      t('exportHeaders.signE'), t('exportHeaders.signS'), t('exportHeaders.signC'),
    ]
    const rows = filtered.map(itr => {
      const executor = itr.itr_assignments.find(a => a.role === 'executor')
      return [
        itr.projects?.code ?? '',
        itr.itr_number,
        itr.tags?.tag_number ?? '',
        itr.tags?.description ?? '',
        itr.itr_templates?.title ?? '',
        itr.project_phases?.code ?? '',
        itr.itr_templates?.disciplines?.code ?? '',
        executor?.profiles?.full_name ?? '',
        itr.scheduled_date ?? '',
        String(itr.progress_pct),
        itr.status,
        itr.itr_signatures.some(s => s.role === 'executor') ? 'S' : 'N',
        itr.itr_signatures.some(s => s.role === 'supervisor') ? 'S' : 'N',
        itr.itr_signatures.some(s => s.role === 'client') ? 'S' : 'N',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `itrs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        {ITR_STATUS_KEYS.map(key => {
          const style = ITR_STYLE[key]
          const active = filterStatus === key
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? '' : key)}
              aria-pressed={active}
              style={{
                padding: '14px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
                background: active ? style.bg : 'var(--card-bg)',
                border: `1px solid ${active ? style.color + '40' : 'var(--border)'}`,
                textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: style.color }}>{counts[key] ?? 0}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{itrStatusLabels[key]}</div>
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
        <Select selectSize="sm" fullWidth={false} value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setPage(1) }} style={{ width: 200 }}>
          <option value="">{tc('allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filterPhase} onChange={(e) => { setFilterPhase(e.target.value); setPage(1) }} style={{ width: 180 }}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filterDisc} onChange={(e) => { setFilterDisc(e.target.value); setPage(1) }} style={{ width: 180 }}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </Select>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFilterStatus(''); setFilterPhase(''); setFilterDisc(''); setFilterProject(''); setSearch(''); setPage(1) }}
          >
            {tc('clearFilters')}
          </Button>
        )}
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: itrs.length })}
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
            {ITR_STATUS_KEYS.map(k => (
              <option key={k} value={k}>{itrStatusLabels[k]}</option>
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
      <DataTable<ItrRow>
        rows={paginated}
        rowKey={(itr) => itr.id}
        responsive="stack"
        ariaLabel={t('title')}
        empty={<EmptyState title={t('empty')} />}
        rowStyle={(itr) => selectedIds.has(itr.id) ? { background: 'var(--primary-50)' } : undefined}
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
            cell: (itr) => (
              <input
                type="checkbox"
                checked={selectedIds.has(itr.id)}
                onChange={() => toggleRow(itr.id)}
                style={{ cursor: 'pointer', accentColor: 'var(--primary-500)', width: 15, height: 15 }}
              />
            ),
          },
          {
            key: 'project',
            width: 110,
            header: t('table.colProject'),
            cell: (itr) => itr.projects ? (
              <a
                href={`/projects/${itr.projects.id}`}
                title={itr.projects.name}
                style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-500)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', display: 'inline-block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {itr.projects.code}
              </a>
            ) : null,
          },
          {
            key: 'itr',
            header: t('table.colItr'),
            cell: (itr) => {
              const phase = itr.project_phases
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {phase && (
                      <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>
                    )}
                    <a
                      href={itr.tags ? `/projects/${itr.project_id}/tags/${itr.tags.id}/itrs/${itr.id}` : '#'}
                      style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-500)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                    >
                      {itr.itr_number}
                    </a>
                  </div>
                  {itr.tags && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {itr.tags.tag_number} — {itr.tags.description}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'template',
            header: t('table.colTemplate'),
            cell: (itr) => {
              const disc = itr.itr_templates?.disciplines
              return (
                <div>
                  {disc && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: disc.color, marginRight: 6, padding: '1px 5px', background: `${disc.color}15`, borderRadius: 'var(--radius-sm)' }}>{disc.code}</span>
                  )}
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>{itr.itr_templates?.title ?? '—'}</span>
                </div>
              )
            },
          },
          {
            key: 'inspector',
            width: 140,
            header: t('table.colInspector'),
            cell: (itr) => {
              const executor = itr.itr_assignments.find(a => a.role === 'executor')
              return (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {executor?.profiles?.full_name ?? '—'}
                </div>
              )
            },
          },
          {
            key: 'date',
            width: 100,
            hideBelow: 1024,
            header: t('table.colDate'),
            cell: (itr) => (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {itr.scheduled_date ?? '—'}
              </div>
            ),
          },
          {
            key: 'progress',
            width: 110,
            header: t('table.colProgress'),
            cell: (itr) => (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)', textAlign: 'right', marginBottom: 3 }}>{itr.progress_pct}%</div>
                <div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: 2 }} />
                </div>
              </div>
            ),
          },
          {
            key: 'status',
            width: 110,
            header: t('table.colStatus'),
            cell: (itr) => {
              const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
              return (
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
                  {itrStatusLabels[itr.status] ?? itr.status}
                </span>
              )
            },
          },
          {
            key: 'signatures',
            width: 80,
            hideBelow: 1024,
            header: t('table.colSignature'),
            cell: (itr) => (
              <div style={{ display: 'flex', gap: 2 }}>
                {(['executor', 'supervisor', 'client'] as const).map(role => {
                  const signed = itr.itr_signatures.some(s => s.role === role)
                  return (
                    <span key={role} style={{ width: 18, height: 18, borderRadius: 'var(--radius-sm)', background: signed ? 'var(--success-50)' : 'var(--gray-50)', border: `1px solid ${signed ? '#a7f3d0' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: signed ? 'var(--success-500)' : 'var(--gray-300)' }}>
                      {SIGN_LABELS[role]}
                    </span>
                  )
                })}
              </div>
            ),
          },
        ] satisfies DataTableColumn<ItrRow>[]}
      />

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
