'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  not_started: { color: '#64748b', bg: '#f1f5f9' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff' },
  completed:    { color: '#10b981', bg: '#ecfdf5' },
  approved:     { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { color: '#ef4444', bg: '#fee2e2' },
}

const ITR_STATUS_KEYS = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const

const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }

const GRID = '36px 110px 1fr 1fr 130px 80px 80px 90px 60px'

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
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `itrs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{tc('allOrg')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {ITR_STATUS_KEYS.map(key => {
          const style = ITR_STYLE[key]
          return (
            <div
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              style={{
                padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                background: filterStatus === key ? style.bg : 'white',
                border: `1px solid ${filterStatus === key ? style.color + '40' : '#e2e8f0'}`,
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: style.color }}>{counts[key] ?? 0}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{itrStatusLabels[key]}</div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        <select value={filterProject} onChange={e => { setFilterProject(e.target.value); setPage(1) }} style={selStyle}>
          <option value="">{tc('allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterPhase} onChange={e => { setFilterPhase(e.target.value); setPage(1) }} style={selStyle}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterDisc} onChange={e => { setFilterDisc(e.target.value); setPage(1) }} style={selStyle}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPhase(''); setFilterDisc(''); setFilterProject(''); setSearch(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            {tc('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: itrs.length })}
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
            {ITR_STATUS_KEYS.map(k => (
              <option key={k} value={k}>{itrStatusLabels[k]}</option>
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
            <span>{t('table.colItr')}</span>
            <span>{t('table.colTemplate')}</span>
            <span>{t('table.colInspector')}</span>
            <span>{t('table.colDate')}</span>
            <span>{t('table.colProgress')}</span>
            <span>{t('table.colStatus')}</span>
            <span>{t('table.colSignature')}</span>
          </div>

          {paginated.map(itr => {
            const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
            const executor = itr.itr_assignments.find(a => a.role === 'executor')
            const disc = itr.itr_templates?.disciplines
            const phase = itr.project_phases
            const proj = itr.projects
            const isSelected = selectedIds.has(itr.id)

            return (
              <div
                key={itr.id}
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
                  onChange={() => toggleRow(itr.id)}
                  style={{ cursor: 'pointer', accentColor: '#3b82f6', width: '15px', height: '15px' }}
                />

                {/* Project */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}`}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={proj.name}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* ITR + Tag */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {phase && (
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>
                    )}
                    <a
                      href={itr.tags ? `/projects/${itr.project_id}/tags/${itr.tags.id}/itrs/${itr.id}` : '#'}
                      style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                    >
                      {itr.itr_number}
                    </a>
                  </div>
                  {itr.tags && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {itr.tags.tag_number} — {itr.tags.description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div>
                  {disc && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: disc.color, marginRight: '6px', padding: '1px 5px', background: `${disc.color}15`, borderRadius: '4px' }}>{disc.code}</span>
                  )}
                  <span style={{ fontSize: '12px', color: '#374151' }}>{itr.itr_templates?.title ?? '—'}</span>
                </div>

                {/* Inspector */}
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {executor?.profiles?.full_name ?? '—'}
                </div>

                {/* Scheduled date */}
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {itr.scheduled_date ?? '—'}
                </div>

                {/* Progress */}
                <div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginBottom: '3px' }}>{itr.progress_pct}%</div>
                  <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '2px' }} />
                  </div>
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: style.bg, color: style.color, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {itrStatusLabels[itr.status] ?? itr.status}
                </span>

                {/* Signatures */}
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(['executor', 'supervisor', 'client'] as const).map(role => {
                    const signed = itr.itr_signatures.some(s => s.role === role)
                    return (
                      <span key={role} style={{ width: '18px', height: '18px', borderRadius: '3px', background: signed ? '#ecfdf5' : '#f8fafc', border: `1px solid ${signed ? '#a7f3d0' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: signed ? '#10b981' : '#cbd5e1' }}>
                        {SIGN_LABELS[role]}
                      </span>
                    )
                  })}
                </div>
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