'use client'

import { PersonName, useAskDialog } from '@/components/ui'
import { isInactiveMember, memberIdSet } from '@/lib/people/inactive'
import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { punchDisplayStatus } from '@/lib/punches/verification'
import { bulkDeletePunches, bulkUpdatePunchStatus } from '@/app/actions/bulk'
import { PUNCH_CATEGORY_CFG as CATEGORY_CFG, PUNCH_STATUS_COLORS as STATUS_COLORS } from '@/lib/constants/status-colors'
import { Pagination } from '@/components/ui'
import { useUrlFilters } from '@/lib/list/useUrlFilters'
import type { PunchListRow, PunchSummary } from '@/lib/list/punch-query'
import { browserToday } from '@/lib/time/zone'
import { punchFiltersQuery } from '@/lib/list/punch-filters'
import { canRaisePunch } from '@/lib/constants/punch-roles'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { alpha, ink } from '@/lib/theme'

const EDITOR_ROLES = ROLE_TIERS.editor

type OrgMember = { user_id: string; profiles: { full_name: string } | null }

// ── Types ──────────────────────────────────────────────────────────────

type Project    = { id: string; name: string; code: string }
type Discipline = { id: string; code: string; name: string; color: string }
type System     = { id: string; code: string; name: string }

// ── Main component ──────────────────────────────────────────────────────

// G-14: una sola lista para el proyecto y para «Todos los proyectos» (`projects` presente = alcance org: columna y
// filtro de proyecto, Excel de la org; sin PDF ni alta, que son del proyecto). Filas = punch_list_v tal cual.
export default function PunchListView({
  projectId,
  projectName,
  projects,
  punches,
  disciplines,
  phases,
  systems,
  orgMembers,
  currentUserRole,
  total,
  page,
  pageSize,
  summary,
  filters,
}: {
  projectId: string
  projectName: string
  projects?: Project[]
  punches: PunchListRow[]
  disciplines: Discipline[]
  /** A19: fases de la org para el filtro (la del ITR que originó el punch). */
  phases?: { code: string; name: string }[]
  systems: System[]
  orgMembers: OrgMember[]
  currentUserRole: string
  total: number
  page: number
  pageSize: number
  summary: PunchSummary
  filters: { cat: string; status: string; disc: string; system: string; q: string; project?: string; assigned?: string; phase?: string }
}) {
  const allScope = projects !== undefined
  const memberIds = useMemo(() => memberIdSet(orgMembers), [orgMembers])
  const t = useTranslations('PunchList')
  const tGuide = useTranslations('PunchGuide')
  const tc = useTranslations('Common')
  const router = useRouter()
  // Sprint E: filtros/página en la URL; `punches` es la página visible.
  const url = useUrlFilters()
  const filterCat = filters.cat as 'A' | 'B' | 'C' | ''
  const [search, setSearch] = useState(filters.q)
  useEffect(() => {
    const handle = setTimeout(() => { if (search !== filters.q) url.set({ q: search }) }, 350)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar cuando cambia lo que escribe el usuario
  }, [search])

  // ── Bulk selection ───────────────────────────────────────────────────
  const [selected, setSelected]      = useState<Set<string>>(new Set())
  const [isBulkPending, startBulkTransition] = useTransition()
  // G-08: diálogo propio
  const { dialog, confirm } = useAskDialog()
  const [bulkError, setBulkError]    = useState<string | null>(null)

  const punchStatusLabels: Record<string, string> = {
    open:        t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    resolved:    t('punchStatus.resolved'),
    closed:      t('punchStatus.closed'),
    cancelled:   t('punchStatus.cancelled'),
  }

  // ── Summary counts ───────────────────────────────────────────────────

  const catACnt   = summary.catAOpen
  const catBCnt   = summary.catBOpen
  const catCCnt   = summary.catCOpen
  const closedCnt = summary.closed

  // ── Filter ───────────────────────────────────────────────────────────

  const filtered = punches

  const hasFilters = [filters.q, filters.cat, filters.status, filters.disc, filters.system, filters.project, filters.assigned, filters.phase].some(Boolean)
  const today = browserToday()

  const filteredIds = useMemo(() => new Set(filtered.map(p => p.id)), [filtered])
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filteredIds.forEach(id => n.add(id)); return n })
    }
  }

  function clearSelection() { setSelected(new Set()); setBulkError(null) }

  const canDelete = EDITOR_ROLES.includes(currentUserRole)
  const canCreate = canRaisePunch(currentUserRole)

  async function handleBulkDelete() {
    if (!selected.size) return
    if (!(await confirm({ message: t('bulk.deleteConfirm', { count: selected.size }), confirmLabel: t('bulk.delete'), danger: true }))) return
    setBulkError(null)
    startBulkTransition(async () => {
      const res = await bulkDeletePunches([...selected])
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
      router.refresh()
    })
  }

  // N2c: el cambio de estado masivo que antes solo tenía la lista global (abierto ↔ en proceso; cerrar y cancelar
  // siguen siendo uno por uno, con verificación o motivo).
  const [bulkStatus, setBulkStatus] = useState<'' | 'open' | 'in_progress'>('')
  function handleBulkStatus() {
    if (!bulkStatus || !selected.size) return
    setBulkError(null)
    startBulkTransition(async () => {
      const res = await bulkUpdatePunchStatus([...selected], bulkStatus)
      if (res.error) { setBulkError(res.error); return }
      setBulkStatus('')
      clearSelection()
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 28px) clamp(12px, 4vw, 32px)', maxWidth: '1200px' }}>
      {dialog}

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '6px' }}>
        <Link href={`/projects/${projectId}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          {t('backLink', { projectName })}
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('filters.count', { filtered: total, total: summary.total })}</span>
          <a
            href={(allScope ? '/punch-list/export' : `/projects/${projectId}/punches/export`) + punchFiltersQuery(filters)}
            style={{
              padding: '7px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            {t('exportExcel')}
          </a>
          {!allScope && (
            <a
              href={`/projects/${projectId}/punches/pdf`}
              target="_blank"
              style={{
                padding: '7px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
                textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
              }}
            >
              {t('exportPdf')}
            </a>
          )}
          <a
            href="/punch-list/procedure"
            target="_blank"
            rel="noopener"
            title={tGuide('procedureHint')}
            style={{
              padding: '7px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            {tGuide('procedure')}
          </a>
          {canCreate && !allScope && (
            <Link
              href={`/projects/${projectId}/punches/new`}
              style={{
                padding: '7px 14px', background: 'var(--primary-600)', border: '1px solid var(--primary-500)',
                borderRadius: '8px', fontSize: '13px', color: '#fff',
                whiteSpace: 'nowrap', fontWeight: 600, textDecoration: 'none',
              }}
            >
              {t('create.button')}
            </Link>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {([
          { labelKey: 'summary.catAOpen' as const, count: catACnt, color: 'var(--danger-700)', bg: 'var(--danger-100)', border: 'var(--danger-200)', filterVal: 'A' as const },
          { labelKey: 'summary.catBOpen' as const, count: catBCnt, color: 'var(--warning-700)', bg: 'var(--warning-50)', border: 'var(--warning-200)', filterVal: 'B' as const },
          { labelKey: 'summary.catCOpen' as const, count: catCCnt, color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)', filterVal: 'C' as const },
          { labelKey: 'summary.closed'   as const, count: closedCnt, color: 'var(--success-700)', bg: 'var(--success-50)', border: 'var(--success-200)', filterVal: null },
        ]).map(card => {
          const filterVal = card.filterVal
          const on = !!filterVal && filterCat === filterVal
          const style: React.CSSProperties = {
            padding: '16px 18px', borderRadius: '12px',
            background: on ? card.bg : 'var(--card-bg)',
            border: `1px solid ${on ? alpha(card.color, 25) : card.border}`,
            cursor: filterVal ? 'pointer' : 'default',
          }
          const body = (
            <>
              <span style={{ display: 'block', fontSize: '24px', fontWeight: 800, color: ink(card.color) }}>{card.count}</span>
              <span style={{ display: 'block', fontSize: '12px', color: ink(card.color), fontWeight: 600, marginTop: '2px' }}>{t(card.labelKey)}</span>
            </>
          )
          // G-12: las tarjetas que filtran son botones (Tab + Enter/Espacio); «Cerrados» solo informa.
          return filterVal ? (
            <button key={card.labelKey} type="button" aria-pressed={on}
              onClick={() => url.set({ cat: filterCat === filterVal ? null : filterVal })}
              style={{ ...style, display: 'block', width: '100%', textAlign: 'left', font: 'inherit' }}>
              {body}
            </button>
          ) : (
            <div key={card.labelKey} style={style}>{body}</div>
          )
        })}
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '12px', background: 'var(--sky-50)', border: '1px solid var(--sky-200)', borderRadius: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sky-700)', flexShrink: 0 }}>
            {t('bulk.selected', { count: selected.size })}
          </span>
          {/* S06 (C-11, D8): ya no hay cancelación masiva: cada punch se cancela con su motivo. */}
          {canDelete && (
            <>
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as '' | 'open' | 'in_progress')} aria-label={tc('changeStatusTo')}
                style={{ padding: '7px 10px', borderRadius: '7px', fontSize: '12px', border: '1px solid var(--sky-200)', background: 'var(--card-bg)', fontFamily: 'inherit' }}>
                <option value="">{tc('changeStatusTo')}</option>
                <option value="open">{punchStatusLabels.open}</option>
                <option value="in_progress">{punchStatusLabels.in_progress}</option>
              </select>
              <button onClick={handleBulkStatus} disabled={!bulkStatus || isBulkPending}
                style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: bulkStatus ? 'var(--solid-sky-700)' : 'var(--gray-100)', color: bulkStatus ? '#fff' : 'var(--text-muted)', border: 'none', cursor: bulkStatus ? 'pointer' : 'default' }}>
                {tc('apply')}
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkPending}
              style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: 'var(--danger-100)', color: 'var(--danger-700)', border: '1px solid var(--danger-200)', cursor: 'pointer' }}
            >
              {t('bulk.delete')}
            </button>
          )}
          <button
            onClick={clearSelection}
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--card-bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {t('bulk.deselect')}
          </button>
          {bulkError && (
            <span style={{ fontSize: '12px', color: 'var(--danger-700)', background: 'var(--danger-100)', padding: '4px 10px', borderRadius: '5px' }}>{bulkError}</span>
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
          aria-label={t('filters.search')}
          style={{ flex: '1 1 220px', minWidth: '180px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' }}
        />

        {allScope && (
          <select value={filters.project ?? ''} onChange={e => url.set({ project: e.target.value })} style={selStyle} aria-label={tc('allProjects')}>
            <option value="">{tc('allProjects')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        )}

        <select value={filters.cat} onChange={e => url.set({ cat: e.target.value })} style={selStyle}>
          <option value="">{t('filters.allCategories')}</option>
          <option value="A">{t('catLabels.A')}</option>
          <option value="B">{t('catLabels.B')}</option>
          <option value="C">{t('catLabels.C')}</option>
        </select>

        {phases && phases.length > 0 && (
          <select value={filters.phase ?? ''} onChange={e => url.set({ phase: e.target.value })} style={selStyle} aria-label={t('filters.allPhases')}>
            <option value="">{t('filters.allPhases')}</option>
            {phases.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            <option value="none">{t('filters.noPhase')}</option>
          </select>
        )}

        <select value={filters.status} onChange={e => url.set({ status: e.target.value })} style={selStyle}>
          <option value="">{t('filters.allStatuses')}</option>
          <option value="active">{t('filters.active')}</option>
          {(['open', 'in_progress', 'closed', 'cancelled'] as const).map(k => (
            <option key={k} value={k}>{punchStatusLabels[k]}</option>
          ))}
        </select>

        {disciplines.length > 0 && (
          <select value={filters.disc} onChange={e => url.set({ disc: e.target.value })} style={selStyle}>
            <option value="">{t('filters.allDisciplines')}</option>
            {disciplines.map(d => <option key={d.id} value={d.code}>{d.code} — {d.name}</option>)}
          </select>
        )}

        {systems.length > 0 && (
          <select value={filters.system} onChange={e => url.set({ system: e.target.value })} style={selStyle}>
            <option value="">{t('filters.allSystems')}</option>
            {systems.map(s => <option key={s.id} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        )}

        {filters.assigned === 'me' && (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--primary-50)', color: 'var(--primary-700)' }}>{t('filters.assignedToMe')}</span>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); url.clear(['q', 'cat', 'status', 'disc', 'system', 'project', 'assigned', 'phase']) }}
            style={{ padding: '8px 12px', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚑</div>
          <p style={{ fontSize: '14px' }}>{hasFilters ? t('noResultsFiltered') : allScope ? t('noResultsEmptyOrg') : t('noResultsEmpty')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto' }}>
          {/* C-29: en el teléfono la tabla se desplaza en horizontal en vez de aplastarse */}
          <table style={{ width: '100%', minWidth: allScope ? '900px' : '820px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th style={{ padding: '10px 14px', width: '36px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    aria-label={t('filters.selectAll', { count: filtered.length })}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary-500)' }}
                  />
                </th>
                {[...(allScope ? [t('table.colProject')] : []), t('table.colPunch'), t('table.colTag'), t('table.colCat'), t('table.colDesc'), t('table.colStatus'), t('table.colAssigned'), t('table.colDue')].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((punch, i) => {
                const catCfg = CATEGORY_CFG[punch.category]
                const displayStatus = punchDisplayStatus(punch)
                const stColors = STATUS_COLORS[displayStatus] ?? STATUS_COLORS.open
                const isChecked = selected.has(punch.id)
                const overdue = !!(punch.target_date && punch.target_date < today && punch.status !== 'closed' && punch.status !== 'cancelled')
                return (
                  <tr
                    key={punch.id}
                    onClick={() => router.push(`/projects/${punch.project_id}/punches/${punch.id}`)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--gray-100)' : 'none', cursor: 'pointer', transition: 'background 0.1s', background: isChecked ? 'var(--primary-50)' : 'transparent' }}
                    onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = 'var(--gray-50)' }}
                    onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = isChecked ? 'var(--primary-50)' : 'transparent' }}
                  >
                    <td style={{ padding: '12px 14px', width: '36px' }} onClick={e => { e.stopPropagation(); toggleRow(punch.id) }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(punch.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary-500)' }}
                      />
                    </td>
                    {allScope && (
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/projects/${punch.project_id}/punches`}
                          onClick={e => e.stopPropagation()}
                          title={punch.project_name}
                          style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {punch.project_code}
                        </Link>
                      </td>
                    )}
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {/* N1b: el número es el enlace a la página del punch (clic medio, compartir) */}
                      <Link href={`/projects/${punch.project_id}/punches/${punch.id}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {punch.punch_number}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {punch.tag_id ? (
                        <div>
                          <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: ink(punch.discipline_color ?? 'var(--text-muted)') }}>{punch.tag_number}</span>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{punch.discipline_code}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: catCfg.bg, color: ink(catCfg.color), border: `1px solid ${catCfg.border}`, whiteSpace: 'nowrap' }}>
                        {catCfg.label}
                      </span>
                      {!punch.category_reviewed_at && punch.status !== 'closed' && punch.status !== 'cancelled' && (
                        <div style={{ fontSize: '12px', color: 'var(--warning-700)', marginTop: '3px', whiteSpace: 'nowrap' }}>{tGuide('unreviewedShort')}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-strong)', maxWidth: '320px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {punch.description}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: stColors.bg, color: ink(stColors.color), whiteSpace: 'nowrap' }}>
                        {punchStatusLabels[displayStatus] ?? punch.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <PersonName name={punch.assigned_to_name} inactive={isInactiveMember(punch.assigned_to, memberIds)} fallback={<span style={{ color: 'var(--text-muted)' }}>{t('noAssignee')}</span>} />
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: overdue ? 'var(--danger-700)' : punch.target_date ? 'var(--text-muted)' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {punch.target_date ?? '—'}
                      {overdue && <span style={{ display: 'block', fontSize: '12px' }}>{t('overdue')}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={total} pageSize={pageSize} onPage={p => url.set({ page: p }, { resetPage: false })} disabled={url.isPending} />

    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-body)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}
