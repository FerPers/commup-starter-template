'use client'

import { PersonName } from '@/components/ui'
import { isInactiveMember, memberIdSet } from '@/lib/people/inactive'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bulkRescheduleItrs } from '@/app/actions/bulk'
import { bulkAssignItrs } from '@/app/actions/itr-assign'
import { normalizeRequired } from '@/lib/itr/signatures'
import AddToWorkPlanModal, { type ModalItr } from '@/components/AddToWorkPlanModal'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'
import { Pagination } from '@/components/ui'
import { useUrlFilters } from '@/lib/list/useUrlFilters'
import type { ItrListRow, ItrSortKey, ItrStatusCounts } from '@/lib/list/itr-types'
import type { SortDir } from '@/lib/list/params'
import { ROLE_TIERS } from '@/lib/constants/roles'

// ── Types ─────────────────────────────────────────────────────────────

type Phase      = { id: string; code: string; name: string; color: string; order_index: number }
type Discipline = { code: string; name: string; color: string }
type OrgUser    = { user_id: string; full_name: string }

const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }
const EDITOR_ROLES = ROLE_TIERS.editor
const ITR_STATUS_KEYS = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const

// ── Component ─────────────────────────────────────────────────────────
// Sprint E: la página, los filtros y el orden viven en la URL; el servidor
// devuelve solo la página visible (50 filas) y los conteos por estado en SQL.

export default function ItrListView({
  projectId,
  projectName,
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
  users = [],
  userRole = '',
  scopes = { systems: [], subsystems: [], areas: [] },
}: {
  projectId: string
  projectName: string
  rows: ItrListRow[]
  total: number
  page: number
  pageSize: number
  counts: ItrStatusCounts
  filters: { status: string; phase: string; disc: string; q: string; system: string; subsystem: string; area: string; assignee: string }
  /** S19 (C-30): jerarquía del proyecto para filtrar. */
  scopes?: {
    systems: { id: string; code: string; name: string; area_id: string | null }[]
    subsystems: { id: string; code: string; name: string; system_id: string }[]
    areas: { id: string; code: string; name: string }[]
  }
  sort: ItrSortKey
  dir: SortDir
  phases: Phase[]
  disciplines: Discipline[]
  users?: OrgUser[]
  userRole?: string
}) {
  const t = useTranslations('ItrList')
  const canEdit = EDITOR_ROLES.includes(userRole)
  const memberIds = useMemo(() => memberIdSet(users), [users])
  const router = useRouter()
  const url = useUrlFilters()

  // ── Búsqueda con debounce → URL ──────────────────────────────────────
  const [search, setSearch] = useState(filters.q)
  useEffect(() => {
    const handle = setTimeout(() => { if (search !== filters.q) url.set({ q: search }) }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar cuando cambia lo que escribe el usuario
  }, [search])

  // ── Bulk selection (acotada a la página visible) ─────────────────────
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate]       = useState('')
  const [bulkUserId, setBulkUserId]   = useState('')
  const [isPending, startTransition]  = useTransition()
  const [bulkError, setBulkError]     = useState<string | null>(null)
  const [showPlanModal, setShowPlanModal] = useState(false)

  const planModalMembers = useMemo(
    () => users.map(u => ({ user_id: u.user_id, full_name: u.full_name })),
    [users],
  )

  // Solo cuentan las selecciones que siguen en la página actual
  const selectedRows = useMemo(() => rows.filter(r => selected.has(r.id)), [rows, selected])
  const selectedCount = selectedRows.length
  const allPageSelected = rows.length > 0 && selectedCount === rows.length

  const totalAll = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])
  const hasFilters = !!(filters.status || filters.phase || filters.disc || filters.q || filters.system || filters.subsystem || filters.area || filters.assignee)
  const visibleSystems = filters.area ? scopes.systems.filter(s => s.area_id === filters.area) : scopes.systems
  const visibleSubsystems = filters.system ? scopes.subsystems.filter(s => s.system_id === filters.system) : scopes.subsystems

  function toggleSort(key: ItrSortKey) {
    if (sort === key) url.set({ sort: key, dir: dir === 'asc' ? 'desc' : 'asc' }, { resetPage: false })
    else url.set({ sort: key, dir: key === 'created_at' ? 'desc' : 'asc' }, { resetPage: false })
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allPageSelected ? new Set() : new Set(rows.map(r => r.id)))
  }

  function clearSelection() {
    setSelected(new Set())
    setBulkDate('')
    setBulkUserId('')
    setBulkError(null)
  }

  // D7 (S05): reprogramar en lugar de cambiar el estado a mano (el estado sale del contenido y las firmas).
  function applyBulkReschedule() {
    if (!bulkDate || !selectedCount) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkRescheduleItrs(selectedRows.map(r => r.id), bulkDate)
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
      router.refresh()
    })
  }

  function applyBulkAssign() {
    if (!bulkUserId || !selectedCount) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkAssignItrs(selectedRows.map(r => r.id), bulkUserId, 'executor')
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
      router.refresh()
    })
  }

  const busy = isPending || url.isPending

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: '1200px' }}>

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <a href={`/projects/${projectId}`} style={{ fontSize: '12px', color: 'var(--gray-400)', textDecoration: 'none' }}>
            ← {projectName}
          </a>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0' }}>ITRs</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {canEdit && (
          <a href={`/projects/${projectId}/itrs/generate`} style={{
            padding: '9px 14px', background: 'var(--primary-500)', border: '1px solid var(--primary-500)',
            borderRadius: '8px', fontSize: '13px', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 600,
          }}>
            {t('generate')}
          </a>
        )}
        <a
          href={`/projects/${projectId}/reports/itr-test-pack/pdf`}
          target="_blank"
          style={{
            padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
            textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
          }}
        >
          {t('testPackPdf')}
        </a>
        </div>
      </div>

      {/* Summary cards (conteos en SQL) */}
      {/* C-29: en el teléfono las tarjetas bajan de línea en vez de aplastarse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {ITR_STATUS_KEYS.map(key => {
          const cfg = ITR_STATUS_COLORS[key]
          const active = filters.status === key
          return (
            <button
              key={key}
              onClick={() => url.set({ status: active ? null : key })}
              aria-pressed={active}
              style={{
                padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                background: active ? cfg.bg : 'var(--card-bg)',
                border: `1px solid ${active ? cfg.color + '40' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{counts[key] ?? 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t(`itrStatus.${key}`)}</div>
            </button>
          )
        })}
      </div>

      {/* Bulk toolbar */}
      {selectedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '12px 16px', marginBottom: '12px',
          background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0369a1', flexShrink: 0 }}>
            {t('bulk.selected', { count: selectedCount })}
          </span>

          {canEdit && (
            <>
              <input
                type="date"
                value={bulkDate}
                onChange={e => setBulkDate(e.target.value)}
                disabled={isPending}
                aria-label={t('bulk.reschedulePlaceholder')}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--card-bg)' }}
              />
              <button
                onClick={applyBulkReschedule}
                disabled={!bulkDate || isPending}
                style={{
                  padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: 'none',
                  background: bulkDate && !isPending ? '#0369a1' : 'var(--border)',
                  color: bulkDate && !isPending ? 'var(--card-bg)' : 'var(--gray-400)',
                  cursor: bulkDate && !isPending ? 'pointer' : 'default',
                }}
              >
                {t('bulk.reschedule')}
              </button>
            </>
          )}

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

      {/* Filters → URL */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', width: '220px', fontFamily: 'inherit' }}
        />
        <select value={filters.phase} onChange={e => url.set({ phase: e.target.value })} style={selStyle}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filters.disc} onChange={e => url.set({ disc: e.target.value })} style={selStyle}>
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        {scopes.areas.length > 0 && (
          <select value={filters.area} onChange={e => url.set({ area: e.target.value, system: '', subsystem: '' })} style={selStyle} aria-label={t('filters.allAreas')}>
            <option value="">{t('filters.allAreas')}</option>
            {scopes.areas.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        )}
        <select value={filters.system} onChange={e => url.set({ system: e.target.value, subsystem: '' })} style={selStyle} aria-label={t('filters.allSystems')}>
          <option value="">{t('filters.allSystems')}</option>
          {visibleSystems.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        <select value={filters.subsystem} onChange={e => url.set({ subsystem: e.target.value })} style={selStyle} aria-label={t('filters.allSubsystems')}>
          <option value="">{t('filters.allSubsystems')}</option>
          {visibleSubsystems.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select value={filters.assignee} onChange={e => url.set({ assignee: e.target.value })} style={selStyle} aria-label={t('filters.anyAssignee')}>
          <option value="">{t('filters.anyAssignee')}</option>
          <option value="me">{t('filters.mine')}</option>
          <option value="none">{t('filters.unassigned')}</option>
          {users.map(u => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); url.clear(['status', 'phase', 'disc', 'q', 'system', 'subsystem', 'area', 'assignee']) }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('filters.allPhases').replace('All ', '')} ×
          </button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: 'auto', opacity: busy ? 0.5 : 1 }}>
          {t('filters.count', { filtered: total, total: totalAll })}
        </span>
      </div>

      {/* Add to plan modal */}
      {showPlanModal && (
        <AddToWorkPlanModal
          projectId={projectId}
          itrs={selectedRows.map((itr): ModalItr => ({
            id: itr.id,
            itrNumber: itr.itr_number,
            tagNumber: itr.tag_number ?? undefined,
            defaultAssignedTo: itr.assignments.find(a => a.role === 'executor')?.user_id,
          }))}
          members={planModalMembers}
          onClose={() => setShowPlanModal(false)}
          onSuccess={() => { setShowPlanModal(false); clearSelection(); router.refresh() }}
        />
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: 'var(--gray-400)' }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto', opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 140px 90px 80px 90px 60px', minWidth: '760px', gap: '4px', padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleAll}
              title={t('filters.selectPage', { count: rows.length })}
              style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
            />
            <SortHeader label={t('table.colItr')} sortKey="itr_number" current={sort} dir={dir} onSort={toggleSort} />
            <SortHeader label={t('table.colTemplate')} sortKey="template_title" current={sort} dir={dir} onSort={toggleSort} />
            <span style={thStyle}>{t('table.colInspector')}</span>
            <SortHeader label={t('table.colDate')} sortKey="scheduled_date" current={sort} dir={dir} onSort={toggleSort} />
            <SortHeader label={t('table.colProgress')} sortKey="progress_pct" current={sort} dir={dir} onSort={toggleSort} />
            <SortHeader label={t('table.colStatus')} sortKey="status" current={sort} dir={dir} onSort={toggleSort} />
            <span style={thStyle}>{t('table.colSignature')}</span>
          </div>

          {/* Rows */}
          {rows.map(itr => {
            const st = ITR_STATUS_COLORS[itr.status] ?? ITR_STATUS_COLORS.not_started
            const executor = itr.assignments.find(a => a.role === 'executor')
            const isChecked = selected.has(itr.id)

            return (
              <div
                key={itr.id}
                style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 1fr 140px 90px 80px 90px 60px', minWidth: '760px', gap: '4px',
                  padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center',
                  background: isChecked ? '#eff6ff' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = 'var(--gray-50)' }}
                onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent' }}
              >
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
                    {itr.phase_code && (
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: `${itr.phase_color ?? '#64748b'}18`, color: itr.phase_color ?? '#64748b' }}>{itr.phase_code}</span>
                    )}
                    <a
                      href={itr.tag_id ? `/projects/${projectId}/tags/${itr.tag_id}/itrs/${itr.id}` : '#'}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                    >
                      {itr.itr_number}
                    </a>
                  </div>
                  {itr.tag_number && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {itr.tag_number} — {itr.tag_description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div>
                  {itr.discipline_code && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: itr.discipline_color ?? '#64748b', marginRight: '6px', padding: '1px 5px', background: `${itr.discipline_color ?? '#64748b'}15`, borderRadius: '4px' }}>{itr.discipline_code}</span>
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--gray-700)' }}>{itr.template_title ?? '—'}</span>
                </div>

                {/* Inspector */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <PersonName name={executor?.full_name} inactive={isInactiveMember(executor?.user_id, memberIds)} />
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
                  {normalizeRequired(itr.required_signatures).map(role => {
                    const signed = itr.signatures.some(s => s.role === role)
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

      <Pagination page={page} total={total} pageSize={pageSize} onPage={p => url.set({ page: p }, { resetPage: false })} disabled={busy} />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function SortHeader({ label, sortKey, current, dir, onSort }: {
  label: string
  sortKey: ItrSortKey
  current: ItrSortKey
  dir: SortDir
  onSort: (k: ItrSortKey) => void
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
