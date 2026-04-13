'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updatePunchStatus, closePunch, addPunchComment } from '@/app/actions/punches'
import { bulkUpdatePunchStatus } from '@/app/actions/bulk'

// ── Types ──────────────────────────────────────────────────────────────

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
  raised_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } } | null
}

type Phase      = { id: string; code: string; name: string; color: string }
type Discipline = { id: string; code: string; name: string; color: string }
type System     = { id: string; code: string; name: string }

// ── Config ──────────────────────────────────────────────────────────────

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
} as const

const STATUS_COLORS = {
  open:        { color: '#ef4444', bg: '#fee2e2' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  closed:      { color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { color: '#64748b', bg: '#f1f5f9' },
} as const

// ── Main component ──────────────────────────────────────────────────────

export default function PunchListView({
  projectId,
  projectName,
  punches,
  phases: _phases,
  disciplines,
  systems,
}: {
  projectId: string
  projectName: string
  punches: Punch[]
  phases: Phase[]
  disciplines: Discipline[]
  systems: System[]
}) {
  const t = useTranslations('PunchList')
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDisc, setFilterDisc] = useState('')
  const [filterSystem, setFilterSystem] = useState('')
  const [selectedPunch, setSelectedPunch] = useState<Punch | null>(null)

  // ── Bulk selection ───────────────────────────────────────────────────
  const [selected, setSelected]      = useState<Set<string>>(new Set())
  const [isBulkPending, startBulkTransition] = useTransition()
  const [bulkError, setBulkError]    = useState<string | null>(null)

  const punchStatusLabels: Record<string, string> = {
    open:        t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    closed:      t('punchStatus.closed'),
    cancelled:   t('punchStatus.cancelled'),
  }

  // ── Summary counts ───────────────────────────────────────────────────

  const catACnt   = punches.filter(p => p.category === 'A' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catBCnt   = punches.filter(p => p.category === 'B' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catCCnt   = punches.filter(p => p.category === 'C' && p.status !== 'closed' && p.status !== 'cancelled').length
  const closedCnt = punches.filter(p => p.status === 'closed').length

  // ── Filter ───────────────────────────────────────────────────────────

  const filtered = punches.filter(p => {
    if (filterCat && p.category !== filterCat) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterDisc && p.tags?.disciplines.code !== filterDisc) return false
    if (filterSystem && p.subsystems?.systems.code !== filterSystem) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.punch_number.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !(p.tags?.tag_number.toLowerCase().includes(q)) &&
        !(p.assigned_to_profile?.full_name.toLowerCase().includes(q))
      ) return false
    }
    return true
  })

  const hasFilters = !!(search || filterCat || filterStatus || filterDisc || filterSystem)

  const filteredIds = useMemo(() => new Set(filtered.map(p => p.id)), [filtered])
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.add(id)); return n })
    }
  }

  function clearSelection() { setSelected(new Set()); setBulkError(null) }

  function applyBulk(status: string) {
    setBulkError(null)
    startBulkTransition(async () => {
      const res = await bulkUpdatePunchStatus([...selected], status)
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
      router.refresh()
    })
  }

  function refresh() { router.refresh() }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '6px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          {t('backLink', { projectName })}
        </a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('title')}</h1>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{t('filters.count', { filtered: filtered.length, total: punches.length })}</span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {([
          { labelKey: 'summary.catAOpen' as const, count: catACnt, color: '#ef4444', bg: '#fee2e2', border: '#fecaca', filterVal: 'A' as const },
          { labelKey: 'summary.catBOpen' as const, count: catBCnt, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', filterVal: 'B' as const },
          { labelKey: 'summary.catCOpen' as const, count: catCCnt, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', filterVal: 'C' as const },
          { labelKey: 'summary.closed'   as const, count: closedCnt, color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', filterVal: null },
        ]).map(card => (
          <div
            key={card.labelKey}
            onClick={() => card.filterVal && setFilterCat(prev => prev === card.filterVal ? '' : card.filterVal!)}
            style={{
              padding: '16px 18px', borderRadius: '12px',
              background: filterCat === card.filterVal && card.filterVal ? card.bg : 'white',
              border: `1px solid ${filterCat === card.filterVal && card.filterVal ? card.color + '40' : card.border}`,
              cursor: card.filterVal ? 'pointer' : 'default',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 800, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: '11px', color: card.color, fontWeight: 600, marginTop: '2px' }}>{t(card.labelKey)}</div>
          </div>
        ))}
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0369a1', flexShrink: 0 }}>
            {t('bulk.selected', { count: selected.size })}
          </span>
          <button
            onClick={() => applyBulk('closed')}
            disabled={isBulkPending}
            style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', cursor: 'pointer' }}
          >
            {t('bulk.close')}
          </button>
          <button
            onClick={() => applyBulk('cancelled')}
            disabled={isBulkPending}
            style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}
          >
            {t('bulk.cancelSelected')}
          </button>
          <button
            onClick={clearSelection}
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: '#64748b', background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer' }}
          >
            {t('bulk.deselect')}
          </button>
          {bulkError && (
            <span style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '4px 10px', borderRadius: '5px' }}>{bulkError}</span>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          style={{ flex: '1 1 220px', minWidth: '180px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}
        />

        <select value={filterCat} onChange={e => setFilterCat(e.target.value as 'A' | 'B' | 'C' | '')} style={selStyle}>
          <option value="">{t('filters.allCategories')}</option>
          <option value="A">{t('catLabels.A')}</option>
          <option value="B">{t('catLabels.B')}</option>
          <option value="C">{t('catLabels.C')}</option>
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allStatuses')}</option>
          {(['open', 'in_progress', 'closed', 'cancelled'] as const).map(k => (
            <option key={k} value={k}>{punchStatusLabels[k]}</option>
          ))}
        </select>

        {disciplines.length > 0 && (
          <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={selStyle}>
            <option value="">{t('filters.allDisciplines')}</option>
            {disciplines.map(d => <option key={d.id} value={d.code}>{d.code} — {d.name}</option>)}
          </select>
        )}

        {systems.length > 0 && (
          <select value={filterSystem} onChange={e => setFilterSystem(e.target.value)} style={selStyle}>
            <option value="">{t('filters.allSystems')}</option>
            {systems.map(s => <option key={s.id} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterCat(''); setFilterStatus(''); setFilterDisc(''); setFilterSystem('') }}
            style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚑</div>
          <p style={{ fontSize: '14px' }}>{hasFilters ? t('noResultsFiltered') : t('noResultsEmpty')}</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px 14px', width: '36px', borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                  />
                </th>
                {[t('table.colPunch'), t('table.colTag'), t('table.colCat'), t('table.colDesc'), t('table.colStatus'), t('table.colAssigned'), t('table.colDue')].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((punch, i) => {
                const catCfg = CATEGORY_CFG[punch.category]
                const stColors = STATUS_COLORS[punch.status] ?? STATUS_COLORS.open
                const isChecked = selected.has(punch.id)
                return (
                  <tr
                    key={punch.id}
                    onClick={() => setSelectedPunch(punch)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s', background: isChecked ? '#eff6ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = isChecked ? '#eff6ff' : 'transparent' }}
                  >
                    <td style={{ padding: '12px 14px', width: '36px' }} onClick={e => { e.stopPropagation(); toggleRow(punch.id) }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(punch.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {punch.punch_number}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {punch.tags ? (
                        <div>
                          <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: punch.tags.disciplines.color }}>{punch.tags.tag_number}</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{punch.tags.disciplines.code}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}`, whiteSpace: 'nowrap' }}>
                        {catCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#0f172a', maxWidth: '320px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {punch.description}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: stColors.color, whiteSpace: 'nowrap' }}>
                        {punchStatusLabels[punch.status] ?? punch.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {punch.assigned_to_profile?.full_name ?? <span style={{ color: '#cbd5e1' }}>{t('noAssignee')}</span>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: punch.target_date ? '#475569' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {punch.target_date ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selectedPunch && (
        <PunchDetailModal
          punch={selectedPunch}
          projectId={projectId}
          onClose={() => setSelectedPunch(null)}
          onUpdated={() => { setSelectedPunch(null); refresh() }}
        />
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}

// ── Punch Detail Modal ──────────────────────────────────────────────────

function PunchDetailModal({
  punch,
  projectId,
  onClose,
  onUpdated,
}: {
  punch: Punch
  projectId: string
  onClose: () => void
  onUpdated: () => void
}) {
  const t = useTranslations('PunchList')
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const catCfg = CATEGORY_CFG[punch.category]
  const stColors = STATUS_COLORS[punch.status] ?? STATUS_COLORS.open
  const punchStatusLabels: Record<string, string> = {
    open:        t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    closed:      t('punchStatus.closed'),
    cancelled:   t('punchStatus.cancelled'),
  }
  const isClosed = punch.status === 'closed' || punch.status === 'cancelled'

  function handleStatusChange(newStatus: 'open' | 'in_progress' | 'closed' | 'cancelled') {
    startTransition(async () => {
      let res: { error?: string }
      if (newStatus === 'closed') {
        res = await closePunch({ punchId: punch.id, projectId, tagId: punch.tags?.id ?? null, resolutionComment: comment || undefined })
      } else {
        res = await updatePunchStatus({ punchId: punch.id, status: newStatus, projectId, tagId: punch.tags?.id ?? null })
      }
      if (res.error) { setError(res.error); return }
      onUpdated()
    })
  }

  function handleAddComment() {
    if (!comment.trim()) return
    startTransition(async () => {
      const res = await addPunchComment({ punchId: punch.id, comment: comment.trim(), projectId, tagId: punch.tags?.id ?? null })
      if (res.error) { setError(res.error); return }
      setComment('')
      onUpdated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#475569' }}>{punch.punch_number}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: stColors.color }}>{punchStatusLabels[punch.status] ?? punch.status}</span>
            </div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0, lineHeight: '1.4' }}>{punch.description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer', padding: '0 0 0 12px' }}>✕</button>
        </div>

        {/* Tag link */}
        {punch.tags && (
          <div style={{ marginBottom: '12px' }}>
            <a
              href={`/projects/${projectId}/tags/${punch.tags.id}?tab=punches`}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{punch.tags.tag_number}</span>
              <span style={{ color: '#94a3b8' }}>↗</span>
            </a>
          </div>
        )}

        {/* Meta */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b', marginBottom: '20px', flexWrap: 'wrap' }}>
          {punch.raised_by_profile && <span><strong>{t('detail.raisedBy')}</strong> {punch.raised_by_profile.full_name}</span>}
          {punch.assigned_to_profile && <span><strong>{t('detail.assignedTo')}</strong> {punch.assigned_to_profile.full_name}</span>}
          {punch.target_date && <span><strong>{t('detail.targetDate')}</strong> {punch.target_date}</span>}
          {punch.closed_date && <span><strong>{t('detail.closedDate')}</strong> {punch.closed_date}</span>}
        </div>

        {/* Status actions */}
        {!isClosed && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>{t('detail.changeStatus')}</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {punch.status !== 'in_progress' && (
                <button onClick={() => handleStatusChange('in_progress')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', cursor: 'pointer' }}>
                  {t('detail.toInProgress')}
                </button>
              )}
              <button onClick={() => handleStatusChange('closed')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', cursor: 'pointer' }}>
                {t('detail.close')}
              </button>
              <button onClick={() => handleStatusChange('cancelled')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                {t('detail.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Comment */}
        {!isClosed && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
              {t('detail.labelComment')}
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('detail.commentPlaceholder')}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }}
            />
            <button onClick={handleAddComment} disabled={isPending || !comment.trim()} style={{ padding: '7px 14px', background: comment.trim() ? '#0f172a' : '#f1f5f9', color: comment.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: comment.trim() ? 'pointer' : 'default' }}>
              {t('detail.addComment')}
            </button>
          </div>
        )}

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '12px 0 0' }}>{error}</p>
        )}
      </div>
    </div>
  )
}