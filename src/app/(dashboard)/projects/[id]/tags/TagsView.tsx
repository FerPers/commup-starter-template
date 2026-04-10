'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

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
  not_started: { color: '#94a3b8', bg: '#f1f5f9' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff' },
  complete:     { color: '#10b981', bg: '#ecfdf5' },
}

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
  const [activeDiscipline, setActiveDiscipline] = useState<string>('ALL')
  const router = useRouter()
  const searchParams = useSearchParams()
  const subsystemFilter = searchParams.get('subsystem')

  // When subsystem filter changes from URL, reset discipline filter
  useEffect(() => {
    if (subsystemFilter) setActiveDiscipline('ALL')
  }, [subsystemFilter])

  // Build discipline summary with counts (respects subsystem filter)
  const disciplineMap = new Map<string, { code: string; name: string; color: string; count: number }>()
  const subsystemFilteredTags = subsystemFilter
    ? tags.filter(tag => tag.subsystems?.id === subsystemFilter)
    : tags

  for (const tag of subsystemFilteredTags) {
    const d = tag.disciplines
    if (!disciplineMap.has(d.code)) {
      disciplineMap.set(d.code, { code: d.code, name: d.name, color: d.color, count: 0 })
    }
    disciplineMap.get(d.code)!.count++
  }
  const disciplines = [...disciplineMap.values()].sort((a, b) => a.code.localeCompare(b.code))

  const filtered = subsystemFilteredTags.filter(tag =>
    activeDiscipline === 'ALL' || tag.disciplines.code === activeDiscipline
  )

  // Subsystem name for banner
  const subsystemName = subsystemFilter
    ? tags.find(tag => tag.subsystems?.id === subsystemFilter)?.subsystems?.name ?? subsystemFilter
    : null

  // Show P&ID column only if at least one tag in the filtered set has a P&ID value
  const showPid = filtered.some(tag => tag.pid_drawing)

  const activeDisc = activeDiscipline !== 'ALL'
    ? disciplines.find(d => d.code === activeDiscipline)
    : undefined

  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    complete:     t('status.complete'),
  }

  return (
    <div>
      {/* Discipline filter tabs + import button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
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

        {/* Per-discipline import button */}
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

      {/* Subsystem filter banner */}
      {subsystemName && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', marginBottom: '12px',
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
          fontSize: '13px', color: '#1d4ed8',
        }}>
          <span>
            {t('list.filterBanner', { name: subsystemName, count: subsystemFilteredTags.length })}
          </span>
          <a
            href={`/projects/${projectId}/tags`}
            style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none', fontSize: '12px' }}
          >
            {t('list.clearFilter')}
          </a>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: '#94a3b8', fontSize: '14px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          {t('list.emptyDisc')}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
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

                return (
                  <tr
                    key={tag.id}
                    onClick={() => router.push(`/projects/${projectId}/tags/${tag.id}`)}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{i + 1}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: `${d.color}18`, color: d.color, flexShrink: 0 }}>
                          {d.code}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                          {tag.tag_number}
                        </span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#334155' }}>{tag.description || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
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
                              style={{
                                fontSize: '11px', color: '#2563eb', fontFamily: 'ui-monospace, monospace',
                                background: '#eff6ff', padding: '2px 8px', borderRadius: '5px',
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                              }}
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
                          <span style={{ color: '#e2e8f0', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{maker || '—'}</span>
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
      borderColor: active ? color : '#e2e8f0',
      background: active ? `${color}15` : 'white',
      color: active ? color : '#64748b',
      fontSize: '13px', fontWeight: active ? 600 : 400,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      transition: 'all 0.15s',
    }}>
      {label}
      <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: active ? color : '#f1f5f9', color: active ? 'white' : '#64748b' }}>
        {count}
      </span>
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  )
}

const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
