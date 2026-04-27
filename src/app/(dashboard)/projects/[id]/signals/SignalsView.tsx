'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

const SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO'] as const
type SignalType = typeof SIGNAL_TYPES[number]

const TYPE_COLORS: Record<SignalType, string> = {
  AI: '#3b82f6',
  AO: '#f59e0b',
  DI: '#10b981',
  DO: '#ef4444',
  PI: '#8b5cf6',
  PO: '#06b6d4',
}

const TYPE_LABELS: Record<SignalType, string> = {
  AI: 'Analog In',
  AO: 'Analog Out',
  DI: 'Digital In',
  DO: 'Digital Out',
  PI: 'Pulse In',
  PO: 'Pulse Out',
}

type SignalRow = {
  id: string
  signal_tag: string
  description: string | null
  signal_type: string
  eng_unit: string | null
  range_min: number | null
  range_max: number | null
  service: string | null
  alarm_setpoints: string | null
  origin: string | null
  destination: string | null
  pid_drawing: string | null
  loop_diagram: string | null
  wiring_diagram: string | null
  notes: string | null
  loop_id: string | null
  tags: {
    id: string
    tag_number: string
    subsystems: {
      id: string
      code: string
      name: string
      systems: {
        id: string
        code: string
        name: string
        areas: { id: string; code: string; name: string }
      }
    }
    disciplines: { id: string; code: string; name: string; color: string } | null
  }
}

type SubsystemOption = {
  id: string
  code: string
  name: string
}

export default function SignalsView({
  projectId,
  projectName,
  signals,
  subsystems,
}: {
  projectId: string
  projectName: string
  signals: SignalRow[]
  subsystems: SubsystemOption[]
}) {
  const t = useTranslations('Signals')

  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<string>('all')
  const [subFilter, setSubFilter]       = useState<string>('all')
  const [selected, setSelected]         = useState<SignalRow | null>(null)

  const filtered = useMemo(() => {
    return signals.filter(s => {
      if (typeFilter !== 'all' && s.signal_type !== typeFilter) return false
      if (subFilter !== 'all' && s.tags.subsystems.id !== subFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !s.signal_tag.toLowerCase().includes(q) &&
          !(s.description ?? '').toLowerCase().includes(q) &&
          !s.tags.tag_number.toLowerCase().includes(q) &&
          !(s.service ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [signals, search, typeFilter, subFilter])

  // Count per type for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of signals) {
      counts[s.signal_type] = (counts[s.signal_type] ?? 0) + 1
    }
    return counts
  }, [signals])

  function typeColor(type: string) {
    return TYPE_COLORS[type as SignalType] ?? '#94a3b8'
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '14px',
        }}>
          ← {projectName}
        </a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
              {t('title')}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
              {t('subtitle', { count: signals.length })}
            </p>
          </div>
          <a href={`/projects/${projectId}/import-signals`} style={{
            padding: '8px 16px', background: '#10b981', color: 'white',
            borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none',
          }}>
            {t('importBtn')}
          </a>
        </div>
      </div>

      {/* Type legend / quick filter */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button
          onClick={() => setTypeFilter('all')}
          style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            border: '1px solid',
            background: typeFilter === 'all' ? 'var(--primary-500)' : 'var(--card-bg)',
            color: typeFilter === 'all' ? '#fff' : 'var(--text-muted)',
            borderColor: typeFilter === 'all' ? 'var(--primary-500)' : 'var(--border)',
            cursor: 'pointer',
          }}
        >
          {t('all')} ({signals.length})
        </button>
        {SIGNAL_TYPES.map(type => {
          const count = typeCounts[type] ?? 0
          if (count === 0) return null
          const active = typeFilter === type
          const color = typeColor(type)
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(active ? 'all' : type)}
              style={{
                padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                border: `1px solid ${active ? color : color + '40'}`,
                background: active ? color : color + '12',
                color: active ? 'white' : color,
                cursor: 'pointer',
              }}
            >
              {type} — {TYPE_LABELS[type]} ({count})
            </button>
          )
        })}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1', minWidth: '220px', padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
            outline: 'none', color: 'var(--text-strong)',
          }}
        />
        <select
          value={subFilter}
          onChange={e => setSubFilter(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
            fontSize: '13px', color: 'var(--text-muted)', background: 'var(--card-bg)', cursor: 'pointer',
          }}
        >
          <option value="all">{t('allSubsystems')}</option>
          {subsystems.map(s => (
            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {signals.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>📋</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('emptyTitle')}</p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>{t('emptyDesc')}</p>
          <a href={`/projects/${projectId}/import-signals`} style={{
            padding: '9px 20px', background: '#10b981', color: 'white',
            borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none',
          }}>
            {t('importBtn')}
          </a>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
                  {[t('col.signalTag'), t('col.type'), t('col.instrument'), t('col.subsystem'), t('col.range'), t('col.service'), t('col.pid'), ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left',
                      fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px',
                      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      {t('noResults')}
                    </td>
                  </tr>
                ) : filtered.map((sig, i) => {
                  const color = typeColor(sig.signal_type)
                  const sub = sig.tags.subsystems
                  return (
                    <tr
                      key={sig.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--gray-50)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(selected?.id === sig.id ? null : sig)}
                    >
                      {/* Signal Tag */}
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {sig.signal_tag}
                      </td>

                      {/* Type badge */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                          background: color + '18', color,
                          border: `1px solid ${color}30`,
                        }}>
                          {sig.signal_type}
                        </span>
                      </td>

                      {/* Instrument tag */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {sig.tags.tag_number}
                      </td>

                      {/* Subsystem */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-strong)' }}>{sub.code}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{sub.systems.areas.code} › {sub.systems.code}</div>
                      </td>

                      {/* Range */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {sig.range_min !== null && sig.range_max !== null
                          ? `${sig.range_min} – ${sig.range_max} ${sig.eng_unit ?? ''}`
                          : sig.eng_unit ? `— ${sig.eng_unit}` : '—'
                        }
                      </td>

                      {/* Service */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sig.service || '—'}
                      </td>

                      {/* P&ID */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px', fontFamily: 'monospace' }}>
                        {sig.pid_drawing || '—'}
                      </td>

                      {/* Expand */}
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '12px', textAlign: 'right' }}>
                        {selected?.id === sig.id ? '▲' : '▼'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{
              borderTop: '2px solid var(--border)', padding: '20px 24px',
              background: 'var(--gray-50)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace' }}>{selected.signal_tag}</span>
                  <span style={{
                    marginLeft: '10px', padding: '2px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                    background: typeColor(selected.signal_type) + '18', color: typeColor(selected.signal_type),
                  }}>
                    {selected.signal_type} — {TYPE_LABELS[selected.signal_type as SignalType] ?? selected.signal_type}
                  </span>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {[
                  { label: t('detail.description'), value: selected.description || '—' },
                  { label: t('detail.instrument'),  value: selected.tags.tag_number },
                  { label: t('detail.subsystem'),   value: `${selected.tags.subsystems.code} — ${selected.tags.subsystems.name}` },
                  { label: t('detail.service'),     value: selected.service || '—' },
                  { label: t('detail.range'),       value: selected.range_min !== null && selected.range_max !== null ? `${selected.range_min} – ${selected.range_max} ${selected.eng_unit ?? ''}` : '—' },
                  { label: t('detail.alarms'),      value: selected.alarm_setpoints || '—' },
                  { label: t('detail.origin'),      value: selected.origin || '—' },
                  { label: t('detail.destination'), value: selected.destination || '—' },
                  { label: t('detail.pid'),         value: selected.pid_drawing || '—' },
                  { label: t('detail.loopDiagram'), value: selected.loop_diagram || '—' },
                  { label: t('detail.wiringDiagram'), value: selected.wiring_diagram || '—' },
                  { label: t('detail.notes'),       value: selected.notes || '—' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--card-bg)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{item.label}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-strong)', wordBreak: 'break-word' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: 'var(--gray-50)', fontSize: '12px', color: '#94a3b8' }}>
              {t('showing', { filtered: filtered.length, total: signals.length })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
