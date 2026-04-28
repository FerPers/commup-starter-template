'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'var(--gray-400)',
  in_progress:  '#3b82f6',
  completed:    '#10b981',
  approved:     '#7c3aed',
}

type LoopTag = {
  id: string
  role_in_loop: string | null
  tags: { id: string; tag_number: string } | null
}

type LoopRow = {
  id: string
  loop_number: string
  description: string | null
  status: string
  disciplines: { id: string; code: string; name: string; color: string } | null
  subsystems: {
    id: string; code: string; name: string
    systems: { id: string; code: string; name: string; areas: { id: string; code: string; name: string } }
  } | null
  loop_tags: LoopTag[]
}

export default function LoopsView({
  projectId,
  projectName,
  loops,
}: {
  projectId: string
  projectName: string
  loops: LoopRow[]
}) {
  const t = useTranslations('Signals')

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState<string>('all')
  const [selected, setSelected]     = useState<LoopRow | null>(null)

  const filtered = useMemo(() => {
    return loops.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !l.loop_number.toLowerCase().includes(q) &&
          !(l.description ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [loops, search, statusFilter])

  const statuses = ['not_started', 'in_progress', 'completed', 'approved']

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
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: '0 0 4px' }}>
          {t('loops.title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          {t('loops.subtitle', { count: loops.length })}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={t('loops.searchPlaceholder')}
          aria-label={t('loops.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1', minWidth: '200px', padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-strong)',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', background: 'var(--card-bg)', cursor: 'pointer' }}
        >
          <option value="all">{t('allStatuses')}</option>
          {statuses.map(s => (
            <option key={s} value={s}>{t(`status.${s}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>

      {loops.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>⟳</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('loops.emptyTitle')}</p>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>{t('loops.emptyDesc')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
                  {[t('loops.col.loopNumber'), t('loops.col.description'), t('loops.col.subsystem'), t('loops.col.discipline'), t('loops.col.tags'), t('col.status'), ''].map(h => (
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
                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
                      {t('noResults')}
                    </td>
                  </tr>
                ) : filtered.map((loop, i) => {
                  const statusColor = STATUS_COLORS[loop.status] ?? 'var(--gray-400)'
                  const disc = loop.disciplines
                  const sub = loop.subsystems
                  return (
                    <tr
                      key={loop.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--gray-50)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(selected?.id === loop.id ? null : loop)}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {loop.loop_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loop.description || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {sub ? (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-strong)' }}>{sub.code}</div>
                            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{sub.systems.areas.code} › {sub.systems.code}</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {disc ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                            background: disc.color + '18', color: disc.color,
                          }}>
                            {disc.code}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {loop.loop_tags.length}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          background: statusColor + '18', color: statusColor,
                        }}>
                          {t(`status.${loop.status}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: '12px', textAlign: 'right' }}>
                        {selected?.id === loop.id ? '▲' : '▼'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tags detail panel */}
          {selected && selected.loop_tags.length > 0 && (
            <div style={{ borderTop: '2px solid var(--border)', padding: '16px 24px', background: 'var(--gray-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {selected.loop_number} — {t('loops.tagsInLoop')}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '16px' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selected.loop_tags.map(lt => lt.tags && (
                  <span key={lt.id} style={{
                    padding: '4px 10px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-strong)',
                  }}>
                    {lt.tags.tag_number}
                    {lt.role_in_loop && <span style={{ color: 'var(--gray-400)', marginLeft: '4px' }}>({lt.role_in_loop})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: 'var(--gray-50)', fontSize: '12px', color: 'var(--gray-400)' }}>
            {t('showing', { filtered: filtered.length, total: loops.length })}
          </div>
        </div>
      )}
    </div>
  )
}
