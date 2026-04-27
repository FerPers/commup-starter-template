'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bulkUpdateItrStatus, bulkApproveItrs } from '@/app/actions/bulk'
import { bulkAssignItrs } from '@/app/actions/itr-assign'
import AddToWorkPlanModal, { type ModalItr } from '@/components/AddToWorkPlanModal'

// ── Types ─────────────────────────────────────────────────────────────

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  itr_templates: { code: string; title: string; disciplines: { code: string; name: string; color: string } } | null
  tags: { id: string; tag_number: string; description: string } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_signatures: Array<{ role: string; signed_at: string }>
}

type Phase    = { id: string; code: string; name: string; color: string; order_index: number }
type OrgUser  = { user_id: string; full_name: string }

type SortKey = 'itr_number' | 'scheduled_date' | 'progress_pct' | 'status'
type SortDir = 'asc' | 'desc'

// ── Status config ─────────────────────────────────────────────────────

const ITR_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff' },
  completed:    { color: '#10b981', bg: '#ecfdf5' },
  approved:     { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { color: '#ef4444', bg: '#fee2e2' },
}

const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

// ── Component ─────────────────────────────────────────────────────────

export default function ItrListView({
  projectId,
  projectName,
  itrs,
  phases,
  users = [],
  userRole = '',
}: {
  projectId: string
  projectName: string
  itrs: ItrRow[]
  phases: Phase[]
  users?: OrgUser[]
  userRole?: string
}) {
  const t = useTranslations('ItrList')
  const canEdit = EDITOR_ROLES.includes(userRole)
  const router = useRouter()

  // ── Filters ──────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPhase, setFilterPhase]   = useState('')
  const [filterDisc, setFilterDisc]     = useState('')
  const [search, setSearch]             = useState('')

  // ── Sorting ───────────────────────────────────────────────────────────
  const [sortKey, setSortKey]   = useState<SortKey>('itr_number')
  const [sortDir, setSortDir]   = useState<SortDir>('asc')

  // ── Bulk selection ────────────────────────────────────────────────────
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus]       = useState('')
  const [bulkUserId, setBulkUserId]       = useState('')
  const [isPending, startTransition]      = useTransition()
  const [bulkError, setBulkError]         = useState<string | null>(null)

  // ── Approve confirm modal ─────────────────────────────────────────────
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)

  // ── Add to plan modal ─────────────────────────────────────────────────
  const [showPlanModal, setShowPlanModal] = useState(false)
  const planModalMembers = useMemo(
    () => users.map(u => ({ user_id: u.user_id, full_name: u.full_name })),
    [users],
  )

  // ── Derived data ──────────────────────────────────────────────────────
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
    const list = itrs.filter(itr => {
      if (filterStatus && itr.status !== filterStatus) return false
      if (filterPhase && itr.project_phases?.code !== filterPhase) return false
      if (filterDisc && itr.itr_templates?.disciplines?.code !== filterDisc) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !itr.itr_number.toLowerCase().includes(q) &&
          !(itr.tags?.tag_number ?? '').toLowerCase().includes(q) &&
          !(itr.itr_templates?.title ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })

    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'itr_number')     { av = a.itr_number;     bv = b.itr_number }
      if (sortKey === 'scheduled_date') { av = a.scheduled_date ?? ''; bv = b.scheduled_date ?? '' }
      if (sortKey === 'progress_pct')   { av = a.progress_pct;   bv = b.progress_pct }
      if (sortKey === 'status')         { av = a.status;         bv = b.status }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [itrs, filterStatus, filterPhase, filterDisc, search, sortKey, sortDir])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const itr of itrs) c[itr.status] = (c[itr.status] ?? 0) + 1
    return c
  }, [itrs])

  const filteredIds = useMemo(() => new Set(filtered.map(i => i.id)), [filtered])
  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selected.has(i.id))

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const next = new Set(prev); filteredIds.forEach(id => next.delete(id)); return next })
    } else {
      setSelected(prev => { const next = new Set(prev); filteredIds.forEach(id => next.add(id)); return next })
    }
  }

  function clearSelection() {
    setSelected(new Set())
    setBulkStatus('')
    setBulkUserId('')
    setBulkError(null)
  }

  function applyBulkStatus() {
    if (!bulkStatus || !selected.size) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkUpdateItrStatus([...selected], bulkStatus)
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
    })
  }

  function applyBulkAssign() {
    if (!bulkUserId || !selected.size) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkAssignItrs([...selected], bulkUserId, 'executor')
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
    })
  }

  function applyBulkApprove() {
    if (!selected.size) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkApproveItrs([...selected], projectId)
      if (res.error) { setBulkError(res.error); return }
      if (res.approved === 0) { setBulkError(t('bulk.approveNoneCompleted')); return }
      setShowApproveConfirm(false)
      clearSelection()
      router.refresh()
    })
  }

  // Are all selected ITRs in 'completed' status?
  const allSelectedCompleted = selected.size > 0 &&
    [...selected].every(id => {
      const itr = itrs.find(i => i.id === id)
      return itr?.status === 'completed'
    })

  const hasFilters = !!(filterStatus || filterPhase || filterDisc || search)

  const itrStatusKeys = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '12px', color: 'var(--gray-400)', textDecoration: 'none' }}>
          ← {projectName}
        </a>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0' }}>ITRs</h1>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {itrStatusKeys.map(key => {
          const cfg = ITR_STATUS_STYLE[key]
          return (
            <div
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              style={{
                padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                background: filterStatus === key ? cfg.bg : 'var(--card-bg)',
                border: `1px solid ${filterStatus === key ? cfg.color + '40' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{counts[key] ?? 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t(`itrStatus.${key}`)}</div>
            </div>
          )
        })}
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '12px 16px', marginBottom: '12px',
          background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0369a1', flexShrink: 0 }}>
            {t('bulk.selected', { count: selected.size })}
          </span>

          {/* Change status */}
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            disabled={isPending}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--card-bg)' }}
          >
            <option value="">{t('bulk.statusPlaceholder')}</option>
            {itrStatusKeys.map(k => (
              <option key={k} value={k}>{t(`itrStatus.${k}`)}</option>
            ))}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={!bulkStatus || isPending}
            style={{
              padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: 'none',
              background: bulkStatus && !isPending ? '#0369a1' : 'var(--border)',
              color: bulkStatus && !isPending ? 'var(--card-bg)' : 'var(--gray-400)',
              cursor: bulkStatus && !isPending ? 'pointer' : 'default',
            }}
          >
            {t('bulk.changeStatus')}
          </button>

          {/* Assign inspector */}
          {canEdit && users.length > 0 && (
            <>
              <div style={{ width: '1px', height: '24px', background: '#bae6fd', flexShrink: 0 }} />
              <select
                value={bulkUserId}
                onChange={e => setBulkUserId(e.target.value)}
                disabled={isPending}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--card-bg)' }}
              >
                <option value="">{t('bulk.assignPlaceholder')}</option>
                {users.map(u => (
                  <option key={u.user_id} value={u.user_id}>{u.full_name}</option>
                ))}
              </select>
              <button
                onClick={applyBulkAssign}
                disabled={!bulkUserId || isPending}
                style={{
                  padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: 'none',
                  background: bulkUserId && !isPending ? '#7c3aed' : 'var(--border)',
                  color: bulkUserId && !isPending ? 'var(--card-bg)' : 'var(--gray-400)',
                  cursor: bulkUserId && !isPending ? 'pointer' : 'default',
                }}
              >
                {t('bulk.assign')}
              </button>
            </>
          )}

          {/* Add to work plan */}
          {canEdit && (
            <>
              <div style={{ width: '1px', height: '24px', background: '#bae6fd', flexShrink: 0 }} />
              <button
                onClick={() => setShowPlanModal(true)}
                disabled={isPending}
                style={{
                  padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                  background: '#f0fdf4', color: '#16a34a', cursor: isPending ? 'not-allowed' : 'pointer',
                  border: '1px solid #bbf7d0',
                }}
              >
                {t('bulk.addToPlan')}
              </button>
            </>
          )}

          {/* Bulk approve */}
          {canEdit && allSelectedCompleted && (
            <>
              <div style={{ width: '1px', height: '24px', background: '#bae6fd', flexShrink: 0 }} />
              <button
                onClick={() => setShowApproveConfirm(true)}
                disabled={isPending}
                style={{
                  padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                  background: '#7c3aed', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer',
                  border: 'none', opacity: isPending ? 0.7 : 1,
                }}
              >
                {t('bulk.approveSelected')}
              </button>
            </>
          )}

          <button
            onClick={clearSelection}
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--card-bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {t('bulk.deselect')}
          </button>

          {bulkError && (
            <span style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '4px 10px', borderRadius: '5px' }}>{bulkError}</span>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', width: '220px', fontFamily: 'inherit' }}
        />
        <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={selStyle}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPhase(''); setFilterDisc(''); setSearch('') }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('filters.allPhases').replace('All ', '')} ×
          </button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: itrs.length })}
        </span>
      </div>

      {/* Approve confirm modal */}
      {showApproveConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowApproveConfirm(false) }}
        >
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>
              {t('bulk.approveConfirmTitle')}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 22px' }}>
              {t('bulk.approveConfirmDesc', { count: selected.size })}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApproveConfirm(false)}
                style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {t('bulk.deselect')}
              </button>
              <button
                onClick={applyBulkApprove}
                disabled={isPending}
                style={{ padding: '8px 20px', background: '#7c3aed', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending ? '...' : t('bulk.approveSelected')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {/* Add to plan modal */}
      {showPlanModal && (() => {
        const selectedItrs: ModalItr[] = filtered
          .filter(itr => selected.has(itr.id))
          .map(itr => ({
            id: itr.id,
            itrNumber: itr.itr_number,
            tagNumber: itr.tags?.tag_number,
            defaultAssignedTo: itr.itr_assignments.find(a => a.role === 'executor')?.user_id,
          }))
        return (
          <AddToWorkPlanModal
            projectId={projectId}
            itrs={selectedItrs}
            members={planModalMembers}
            onClose={() => setShowPlanModal(false)}
            onSuccess={() => { setShowPlanModal(false); clearSelection(); router.refresh() }}
          />
        )
      })()}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: 'var(--gray-400)' }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 140px 90px 80px 90px 60px', gap: '4px', padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAll}
              style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
            />
            <SortHeader label={t('table.colItr')} sortKey="itr_number" current={sortKey} dir={sortDir} onSort={toggleSort} />
            <span style={thStyle}>{t('table.colTemplate')}</span>
            <span style={thStyle}>{t('table.colInspector')}</span>
            <SortHeader label={t('table.colDate')} sortKey="scheduled_date" current={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortHeader label={t('table.colProgress')} sortKey="progress_pct" current={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortHeader label={t('table.colStatus')} sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} />
            <span style={thStyle}>{t('table.colSignature')}</span>
          </div>

          {/* Rows */}
          {filtered.map(itr => {
            const st = ITR_STATUS_STYLE[itr.status] ?? ITR_STATUS_STYLE.not_started
            const executor = itr.itr_assignments.find(a => a.role === 'executor')
            const disc = itr.itr_templates?.disciplines
            const phase = itr.project_phases
            const isChecked = selected.has(itr.id)

            return (
              <div
                key={itr.id}
                style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 1fr 140px 90px 80px 90px 60px', gap: '4px',
                  padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center',
                  background: isChecked ? '#eff6ff' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = 'var(--gray-50)' }}
                onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleRow(itr.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                />

                {/* ITR + Tag */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {phase && (
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>
                    )}
                    <a
                      href={itr.tags ? `/projects/${projectId}/tags/${itr.tags.id}/itrs/${itr.id}` : '#'}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                    >
                      {itr.itr_number}
                    </a>
                  </div>
                  {itr.tags && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {itr.tags.tag_number} — {itr.tags.description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div>
                  {disc && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: disc.color, marginRight: '6px', padding: '1px 5px', background: `${disc.color}15`, borderRadius: '4px' }}>{disc.code}</span>
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--gray-700)' }}>{itr.itr_templates?.title ?? '—'}</span>
                </div>

                {/* Inspector */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {executor?.profiles?.full_name ?? '—'}
                </div>

                {/* Date */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {itr.scheduled_date ?? '—'}
                </div>

                {/* Progress */}
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-400)', textAlign: 'right', marginBottom: '3px' }}>{itr.progress_pct}%</div>
                  <div style={{ height: '4px', background: 'var(--gray-100)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '2px' }} />
                  </div>
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {t(`itrStatus.${itr.status}` as Parameters<typeof t>[0])}
                </span>

                {/* Signatures */}
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(['executor', 'supervisor', 'client'] as const).map(role => {
                    const signed = itr.itr_signatures.some(s => s.role === role)
                    return (
                      <span key={role} style={{ width: '18px', height: '18px', borderRadius: '3px', background: signed ? '#ecfdf5' : 'var(--gray-50)', border: `1px solid ${signed ? '#a7f3d0' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: signed ? '#10b981' : 'var(--gray-300)' }}>
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
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function SortHeader({ label, sortKey, current, dir, onSort }: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        all: 'unset', display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', fontWeight: 700, color: active ? '#3b82f6' : 'var(--gray-400)',
        textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {label}
      <span style={{ fontSize: '10px', opacity: active ? 1 : 0.4 }}>
        {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--gray-700)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}

const thStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
