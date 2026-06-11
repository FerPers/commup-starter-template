'use client'

import type { Enums } from '@/types/supabase.generated'
import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bulkUpdateTagStatus } from '@/app/actions/bulk'

type Discipline = { id: string; code: string; name: string; color: string }
type Area       = { id: string; code: string; name: string }
type System     = { id: string; code: string; name: string; areas: Area }
type Subsystem  = { id: string; code: string; name: string; systems: System; subsystem_id?: string }
type Tag = {
  id: string
  tag_number: string
  description: string
  status: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  pid_drawing: string | null
  disciplines: Discipline
  subsystems: Subsystem
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress:  { color: '#1d4ed8', bg: '#eff6ff' },
  complete:     { color: '#047857', bg: '#ecfdf5' },
  completed:    { color: '#047857', bg: '#ecfdf5' },
  on_hold:      { color: '#b45309', bg: '#fffbeb' },
}

const TAG_STATUS_KEYS = ['not_started', 'in_progress', 'complete', 'on_hold'] as const

export default function TagsView({
  projectId,
  tags,
  canEdit,
  pidUrlMap = {},
}: {
  projectId: string
  tags: Tag[]
  canEdit: boolean
  pidUrlMap?: Record<string, string>
}) {
  const t = useTranslations('Tags')
  const router = useRouter()
  const searchParams = useSearchParams()
  const subsystemFilter = searchParams.get('subsystem')

  const [activeDiscipline, setActiveDiscipline] = useState<string>('ALL')
  const [search, setSearch] = useState('')

  // ── Bulk ─────────────────────────────────────────────────────────────
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus]   = useState<Enums<'tag_status'> | ''>('')
  const [isPending, startTransition]  = useTransition()
  const [bulkError, setBulkError]     = useState<string | null>(null)

  // Reset discipline when subsystem filter changes — React's "adjust state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  const [prevSubsystemFilter, setPrevSubsystemFilter] = useState(subsystemFilter)
  if (prevSubsystemFilter !== subsystemFilter) {
    setPrevSubsystemFilter(subsystemFilter)
    if (subsystemFilter) setActiveDiscipline('ALL')
  }

  // Build discipline summary
  const subsystemFilteredTags = useMemo(() =>
    subsystemFilter ? tags.filter(tag => tag.subsystems?.id === subsystemFilter) : tags,
  [tags, subsystemFilter])

  const disciplineMap = useMemo(() => {
    const m = new Map<string, { code: string; name: string; color: string; count: number }>()
    for (const tag of subsystemFilteredTags) {
      const d = tag.disciplines
      if (!m.has(d.code)) m.set(d.code, { code: d.code, name: d.name, color: d.color, count: 0 })
      m.get(d.code)!.count++
    }
    return m
  }, [subsystemFilteredTags])

  const disciplines = [...disciplineMap.values()].sort((a, b) => a.code.localeCompare(b.code))

  const filtered = useMemo(() => {
    return subsystemFilteredTags.filter(tag => {
      if (activeDiscipline !== 'ALL' && tag.disciplines.code !== activeDiscipline) return false
      if (search) {
        const q = search.toLowerCase()
        if (!tag.tag_number.toLowerCase().includes(q) && !(tag.description ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [subsystemFilteredTags, activeDiscipline, search])

  const filteredIds = useMemo(() => new Set(filtered.map(t => t.id)), [filtered])
  const allFilteredSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id))

  const subsystemName = subsystemFilter
    ? tags.find(tag => tag.subsystems?.id === subsystemFilter)?.subsystems?.name ?? subsystemFilter
    : null

  const showPid = filtered.some(tag => tag.pid_drawing)

  const activeDisc = activeDiscipline !== 'ALL'
    ? disciplines.find(d => d.code === activeDiscipline)
    : undefined

  // ── Bulk helpers ──────────────────────────────────────────────────────
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

  function clearSelection() { setSelected(new Set()); setBulkStatus(''); setBulkError(null) }

  function applyBulk() {
    if (!bulkStatus || !selected.size) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkUpdateTagStatus([...selected], bulkStatus)
      if (res.error) { setBulkError(res.error); return }
      clearSelection()
      router.refresh()
    })
  }

  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    complete:     t('status.complete'),
    completed:    t('status.completed'),
    on_hold:      t('status.on_hold'),
  }

  return (
    <div>
      {/* Discipline filter tabs + import button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <FilterTab
            label={t('list.all')}
            count={tags.length}
            active={activeDiscipline === 'ALL'}
            color="#3b82f6"
            onClick={() => setActiveDiscipline('ALL')}
          />
          {disciplines.map(d => (
            <FilterTab
              key={d.code}
              label={`${d.code} — ${d.name}`}
              count={d.count}
              active={activeDiscipline === d.code}
              color={d.color}
              onClick={() => setActiveDiscipline(d.code)}
            />
          ))}
        </div>

        {canEdit && (
          <a
            href={
              activeDiscipline === 'ALL'
                ? `/projects/${projectId}/import`
                : `/projects/${projectId}/import?discipline=${activeDiscipline}`
            }
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              background: activeDisc ? `${activeDisc.color}15` : '#eff6ff',
              color: activeDisc ? activeDisc.color : '#3b82f6',
              border: `1px solid ${activeDisc ? `${activeDisc.color}40` : '#bfdbfe'}`,
            }}
          >
            {activeDiscipline !== 'ALL' ? t('list.importDisc', { disc: activeDiscipline }) : t('list.importTags')}
          </a>
        )}
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          style={{ width: '280px', maxWidth: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>

      {/* Subsystem banner */}
      {subsystemName && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '13px', color: '#1d4ed8' }}>
          <span>{t('list.filterBanner', { name: subsystemName, count: subsystemFilteredTags.length })}</span>
          <a href={`/projects/${projectId}/tags`} style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none', fontSize: '12px' }}>
            {t('list.clearFilter')}
          </a>
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0369a1', flexShrink: 0 }}>
            {t('list.bulkSelected', { count: selected.size })}
          </span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value as Enums<'tag_status'> | '')}
            disabled={isPending}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--card-bg)' }}
          >
            <option value="">{t('list.bulkChangeStatus')}</option>
            {TAG_STATUS_KEYS.map(k => (
              <option key={k} value={k}>{STATUS_LABELS[k]}</option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            disabled={!bulkStatus || isPending}
            style={{
              padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: 'none',
              background: bulkStatus && !isPending ? '#0369a1' : 'var(--border)',
              color: bulkStatus && !isPending ? '#fff' : 'var(--gray-400)',
              cursor: bulkStatus && !isPending ? 'pointer' : 'default',
            }}
          >
            {t('list.bulkApply')}
          </button>
          <button
            onClick={clearSelection}
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--card-bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {t('list.bulkDeselect')}
          </button>
          {bulkError && (
            <span style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '4px 10px', borderRadius: '5px' }}>{bulkError}</span>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--gray-400)', fontSize: '14px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          {t('list.emptyDisc')}
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                  />
                </th>
                <Th>{t('list.colIndex')}</Th>
                <Th>{t('list.colTag')}</Th>
                <Th>{t('list.colDescription')}</Th>
                <Th>{t('list.colHierarchy')}</Th>
                {showPid && <Th>{t('list.colPid')}</Th>}
                <Th>{t('list.colMaker')}</Th>
                <Th>{t('list.colStatus')}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tag, i) => {
                const statusStyle = STATUS_COLORS[tag.status] ?? STATUS_COLORS.not_started
                const statusLabel = STATUS_LABELS[tag.status] ?? tag.status
                const area   = tag.subsystems?.systems?.areas
                const sys    = tag.subsystems?.systems
                const sub    = tag.subsystems
                const hier   = [area?.code, sys?.code, sub?.code].filter(Boolean).join(' › ')
                const d      = tag.disciplines
                const maker  = [tag.manufacturer, tag.model].filter(Boolean).join(' · ')
                const isChecked = selected.has(tag.id)

                return (
                  <tr
                    key={tag.id}
                    onClick={() => router.push(`/projects/${projectId}/tags/${tag.id}`)}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s', cursor: 'pointer', background: isChecked ? '#eff6ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#f8faff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isChecked ? '#eff6ff' : 'transparent' }}
                  >
                    <td style={{ padding: '12px 16px', width: '36px' }} onClick={e => { e.stopPropagation(); toggleRow(tag.id) }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(tag.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>{i + 1}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: `${d.color}18`, color: d.color, flexShrink: 0 }}>
                          {d.code}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                          {tag.tag_number}
                        </span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{tag.description || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
                        {hier || '—'}
                      </span>
                    </td>
                    {showPid && (
                      <td style={tdStyle}>
                        {tag.pid_drawing ? (
                          pidUrlMap[tag.pid_drawing] ? (
                            <a
                              href={pidUrlMap[tag.pid_drawing]}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t('list.openPid')}
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'ui-monospace, monospace', background: '#eff6ff', padding: '2px 8px', borderRadius: '5px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {tag.pid_drawing}
                              <span style={{ opacity: 0.6, fontSize: '10px' }}>↗</span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'ui-monospace, monospace', background: '#eff6ff', padding: '2px 8px', borderRadius: '5px' }}>
                              {tag.pid_drawing}
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--border)', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{maker || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, background: statusStyle.bg, color: statusStyle.color }}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterTab({ label, count, active, color, onClick }: {
  label: string; count: number; active: boolean; color: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: '8px', border: '1px solid',
      borderColor: active ? color : 'var(--border)',
      background: active ? `${color}15` : 'var(--card-bg)',
      color: active ? color : 'var(--text-muted)',
      fontSize: '13px', fontWeight: active ? 600 : 400,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      transition: 'all 0.15s',
    }}>
      {label}
      <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: active ? color : 'var(--gray-100)', color: active ? '#fff' : 'var(--text-muted)' }}>
        {count}
      </span>
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  )
}

const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
