'use client'

import type { Enums } from '@/types/supabase.generated'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X, Download } from 'lucide-react'
import { Button, Input, Select, EmptyState, DataTable, Pagination, type DataTableColumn } from '@/components/ui'
import { bulkUpdateItrStatus } from '@/app/actions/bulk'
import { exportItrList } from '@/app/actions/itr-list'
import { useUrlFilters } from '@/lib/list/useUrlFilters'
import type { ItrListRow, ItrSortKey, ItrStatusCounts } from '@/lib/list/itr-types'
import type { SortDir } from '@/lib/list/params'

type Project    = { id: string; name: string; code: string }
type Phase      = { id: string; code: string; name: string; color: string; order_index: number }
type Discipline = { code: string; name: string; color: string }

const ITR_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-500)', bg: 'var(--success-50)' },
  approved:    { color: '#7c3aed',            bg: '#f5f3ff' },
  rejected:    { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
}

const ITR_STATUS_KEYS = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const
const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }

// Sprint E: lista global paginada en servidor; filtros/orden/página en la URL.
export default function ItrListGlobal({
  projects,
  rows,
  total,
  page,
  pageSize,
  counts,
  filters,
  sort,
  dir,
  phases,
  disciplines,
}: {
  projects: Project[]
  rows: ItrListRow[]
  total: number
  page: number
  pageSize: number
  counts: ItrStatusCounts
  filters: { status: string; phase: string; disc: string; q: string; project: string }
  sort: ItrSortKey
  dir: SortDir
  phases: Phase[]
  disciplines: Discipline[]
}) {
  const t  = useTranslations('ItrList')
  const tc = useTranslations('Common')
  const router = useRouter()
  const url = useUrlFilters()

  const itrStatusLabels: Record<string, string> = {
    not_started: t('itrStatus.not_started'),
    in_progress: t('itrStatus.in_progress'),
    completed:   t('itrStatus.completed'),
    approved:    t('itrStatus.approved'),
    rejected:    t('itrStatus.rejected'),
  }

  // Búsqueda con debounce → URL
  const [search, setSearch] = useState(filters.q)
  useEffect(() => {
    const handle = setTimeout(() => { if (search !== filters.q) url.set({ q: search }) }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar cuando cambia lo que escribe el usuario
  }, [search])

  // Bulk selection (página visible)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<Enums<'itr_status'> | ''>('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [isExporting, startExport] = useTransition()

  const selectedRows = useMemo(() => rows.filter(r => selectedIds.has(r.id)), [rows, selectedIds])
  const allPageSelected = rows.length > 0 && selectedRows.length === rows.length
  const totalAll = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])
  const hasFilters = !!(filters.status || filters.phase || filters.disc || filters.project || filters.q)
  const busy = url.isPending

  function toggleSelectAll() {
    setSelectedIds(allPageSelected ? new Set() : new Set(rows.map(i => i.id)))
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
    if (!bulkStatus || selectedRows.length === 0) return
    setBulkLoading(true)
    setBulkError('')
    const { error } = await bulkUpdateItrStatus(selectedRows.map(r => r.id), bulkStatus)
    setBulkLoading(false)
    if (error) { setBulkError(error); return }
    setSelectedIds(new Set())
    setBulkStatus('')
    router.refresh()
  }

  function exportCsv() {
    startExport(async () => {
      const res = await exportItrList({ filters: { status: filters.status, phase: filters.phase, disc: filters.disc, q: filters.q, project: filters.project } })
      if (res.error || !res.rows) { setBulkError(res.error ?? 'Export error'); return }
      const headers = [
        t('exportHeaders.project'), t('exportHeaders.itr'), t('exportHeaders.tag'),
        t('exportHeaders.tagDesc'), t('exportHeaders.template'), t('exportHeaders.phase'),
        t('exportHeaders.discipline'), t('exportHeaders.inspector'), t('exportHeaders.scheduledDate'),
        t('exportHeaders.progress'), t('exportHeaders.status'),
        t('exportHeaders.signE'), t('exportHeaders.signS'), t('exportHeaders.signC'),
      ]
      const body = res.rows.map(itr => {
        const executor = itr.assignments.find(a => a.role === 'executor')
        return [
          itr.project_code ?? '',
          itr.itr_number,
          itr.tag_number ?? '',
          itr.tag_description ?? '',
          itr.template_title ?? '',
          itr.phase_code ?? '',
          itr.discipline_code ?? '',
          executor?.full_name ?? '',
          itr.scheduled_date ?? '',
          String(itr.progress_pct),
          itr.status,
          itr.signatures.some(s => s.role === 'executor') ? 'S' : 'N',
          itr.signatures.some(s => s.role === 'supervisor') ? 'S' : 'N',
          itr.signatures.some(s => s.role === 'client') ? 'S' : 'N',
        ]
      })
      const csv = [headers, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `itrs_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(href)
    })
  }

  function toggleSort(key: ItrSortKey) {
    if (sort === key) url.set({ sort: key, dir: dir === 'asc' ? 'desc' : 'asc' }, { resetPage: false })
    else url.set({ sort: key, dir: key === 'created_at' ? 'desc' : 'asc' }, { resetPage: false })
  }

  const sortable = (label: string, key: ItrSortKey) => (
    <button
      onClick={() => toggleSort(key)}
      style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center', color: sort === key ? 'var(--primary-500)' : 'inherit' }}
    >
      {label}
      <span style={{ fontSize: 10, opacity: sort === key ? 1 : 0.4 }}>{sort === key ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards (conteos en SQL) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        {ITR_STATUS_KEYS.map(key => {
          const style = ITR_STYLE[key]
          const active = filters.status === key
          return (
            <button
              key={key}
              onClick={() => url.set({ status: active ? null : key })}
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

      {/* Filters → URL */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          inputSize="sm"
          fullWidth={false}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          leftIcon={<Search size={14} />}
          style={{ width: 240 }}
        />
        <Select selectSize="sm" fullWidth={false} value={filters.project} onChange={e => url.set({ project: e.target.value })} style={{ minWidth: 160 }}>
          <option value="">{tc('allOrg')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filters.phase} onChange={e => url.set({ phase: e.target.value })} style={{ minWidth: 140 }}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filters.disc} onChange={e => url.set({ disc: e.target.value })} style={{ minWidth: 150 }}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" leftIcon={<X size={13} />} onClick={() => { setSearch(''); url.clear(['status', 'phase', 'disc', 'project', 'q']) }}>
            {tc('clear')}
          </Button>
        )}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'auto', opacity: busy ? 0.5 : 1 }}>
          {t('filters.count', { filtered: total, total: totalAll })}
        </span>
        {total > 0 && (
          <Button variant="outline" size="sm" leftIcon={<Download size={13} />} onClick={exportCsv} loading={isExporting}>
            {isExporting ? tc('exporting') : 'CSV'}
          </Button>
        )}
      </div>

      {/* Bulk toolbar */}
      {selectedRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-700)' }}>
            {t('bulk.selected', { count: selectedRows.length })}
          </span>
          <Select selectSize="sm" fullWidth={false} value={bulkStatus} onChange={e => setBulkStatus(e.target.value as Enums<'itr_status'> | '')} style={{ minWidth: 170 }}>
            <option value="">{t('bulk.statusPlaceholder')}</option>
            {ITR_STATUS_KEYS.map(k => <option key={k} value={k}>{itrStatusLabels[k]}</option>)}
          </Select>
          <Button size="sm" onClick={handleBulkApply} disabled={!bulkStatus} loading={bulkLoading}>{t('bulk.apply')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>{tc('deselectAll')}</Button>
          {bulkError && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-500)' }}>{bulkError}</span>}
        </div>
      )}
      {bulkError && selectedRows.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-500)', margin: '0 0 12px' }}>{bulkError}</p>
      )}

      <div style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      <DataTable<ItrListRow>
        rows={rows}
        rowKey={(itr) => itr.id}
        ariaLabel={t('title')}
        responsive="stack"
        empty={<EmptyState title={t('empty')} />}
        columns={[
          {
            key: 'select',
            width: 36,
            header: (
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleSelectAll}
                aria-label={allPageSelected ? tc('deselectAll') : t('filters.selectPage', { count: rows.length })}
                title={allPageSelected ? tc('deselectAll') : t('filters.selectPage', { count: rows.length })}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary-500)' }}
              />
            ),
            cell: (itr) => (
              <input
                type="checkbox"
                checked={selectedIds.has(itr.id)}
                onChange={() => toggleRow(itr.id)}
                onClick={e => e.stopPropagation()}
                aria-label={itr.itr_number}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary-500)' }}
              />
            ),
          },
          {
            key: 'project',
            width: 120,
            hideBelow: 900,
            header: t('table.colProject'),
            cell: (itr) => (
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {itr.project_code ?? '—'}
              </span>
            ),
          },
          {
            key: 'itr',
            header: sortable(t('table.colItr'), 'itr_number'),
            cell: (itr) => (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {itr.phase_code && (
                    <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 700, background: `${itr.phase_color ?? '#64748b'}18`, color: itr.phase_color ?? '#64748b' }}>{itr.phase_code}</span>
                  )}
                  <a
                    href={itr.tag_id ? `/projects/${itr.project_id}/tags/${itr.tag_id}/itrs/${itr.id}` : `/projects/${itr.project_id}/itrs`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--primary-500)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                  >
                    {itr.itr_number}
                  </a>
                </div>
                {itr.tag_number && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                    {itr.tag_number} — {itr.tag_description}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'template',
            hideBelow: 1024,
            header: sortable(t('table.colTemplate'), 'template_title'),
            cell: (itr) => (
              <div>
                {itr.discipline_code && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: itr.discipline_color ?? '#64748b', marginRight: 6, padding: '1px 5px', background: `${itr.discipline_color ?? '#64748b'}15`, borderRadius: 'var(--radius-sm)' }}>{itr.discipline_code}</span>
                )}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-700)' }}>{itr.template_title ?? '—'}</span>
              </div>
            ),
          },
          {
            key: 'inspector',
            width: 140,
            hideBelow: 1200,
            header: t('table.colInspector'),
            cell: (itr) => (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {itr.assignments.find(a => a.role === 'executor')?.full_name ?? '—'}
              </span>
            ),
          },
          {
            key: 'date',
            width: 100,
            hideBelow: 1024,
            header: sortable(t('table.colDate'), 'scheduled_date'),
            cell: (itr) => (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {itr.scheduled_date ?? '—'}
              </div>
            ),
          },
          {
            key: 'progress',
            width: 110,
            header: sortable(t('table.colProgress'), 'progress_pct'),
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
            header: sortable(t('table.colStatus'), 'status'),
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
                  const signed = itr.signatures.some(s => s.role === role)
                  return (
                    <span key={role} style={{ width: 18, height: 18, borderRadius: 'var(--radius-sm)', background: signed ? 'var(--success-50)' : 'var(--gray-50)', border: `1px solid ${signed ? '#a7f3d0' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: signed ? 'var(--success-500)' : 'var(--gray-300)' }}>
                      {SIGN_LABELS[role]}
                    </span>
                  )
                })}
              </div>
            ),
          },
        ] satisfies DataTableColumn<ItrListRow>[]}
      />
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} onPage={p => url.set({ page: p }, { resetPage: false })} disabled={busy} />
    </div>
  )
}
