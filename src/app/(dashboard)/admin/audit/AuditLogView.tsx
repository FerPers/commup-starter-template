'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'

type LogEntry = {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  payload: Record<string, unknown> | null
  created_at: string
  profiles: { full_name: string } | null
}

type User = { id: string; full_name: string }

const ENTITY_TYPES = [
  'tags', 'itrs', 'punches', 'certificates',
  'systems', 'subsystems', 'loops', 'interlocks', 'signals',
]

const ACTION_COLORS: Record<string, string> = {
  created: '#10b981',
  updated: '#3b82f6',
  deleted: '#ef4444',
}

export default function AuditLogView({
  logs,
  total,
  page,
  pageSize,
  users,
  filters,
}: {
  logs: LogEntry[]
  total: number
  page: number
  pageSize: number
  users: User[]
  filters: { entityType: string; userId: string; from: string; to: string }
}) {
  const t = useTranslations('AuditLog')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)

  const [entityType, setEntityType] = useState(filters.entityType)
  const [userId, setUserId] = useState(filters.userId)
  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)

  function applyFilters(overrides: Partial<typeof filters> = {}) {
    const params = new URLSearchParams(searchParams.toString())
    const merged = { entityType, userId, from, to, ...overrides }

    merged.entityType ? params.set('entityType', merged.entityType) : params.delete('entityType')
    merged.userId ? params.set('userId', merged.userId) : params.delete('userId')
    merged.from ? params.set('from', merged.from) : params.delete('from')
    merged.to ? params.set('to', merged.to) : params.delete('to')
    params.delete('page')

    startTransition(() => router.push(`?${params.toString()}`))
  }

  function clearFilters() {
    setEntityType('')
    setUserId('')
    setFrom('')
    setTo('')
    startTransition(() => router.push('/admin/audit'))
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    startTransition(() => router.push(`?${params.toString()}`))
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
          {t('subtitle', { total })}
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{t('filters.entityType')}</label>
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('filters.all')}</option>
            {ENTITY_TYPES.map(et => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{t('filters.user')}</label>
          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('filters.all')}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{t('filters.from')}</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{t('filters.to')}</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingBottom: '1px' }}>
          <button onClick={() => applyFilters()} style={btnPrimary}>{t('filters.apply')}</button>
          <button onClick={clearFilters} style={btnOutline}>{t('filters.clear')}</button>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '180px 1fr 120px 120px 36px',
          padding: '10px 16px', background: 'var(--gray-50)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>{t('cols.date')}</span>
          <span>{t('cols.user')}</span>
          <span>{t('cols.entity')}</span>
          <span>{t('cols.action')}</span>
          <span />
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px' }}>
            {t('empty')}
          </div>
        ) : (
          logs.map(log => {
            const isExpanded = expanded === log.id
            const actionColor = ACTION_COLORS[log.action] ?? 'var(--text-muted)'
            const date = new Date(log.created_at).toLocaleString(locale, {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })

            return (
              <div key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '180px 1fr 120px 120px 36px',
                    padding: '12px 16px', alignItems: 'center',
                    cursor: log.payload ? 'pointer' : 'default',
                  }}
                  onClick={() => log.payload && setExpanded(isExpanded ? null : log.id)}
                >
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-strong)' }}>
                    {log.profiles?.full_name ?? '—'}
                  </span>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '999px',
                      background: 'var(--gray-100)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500,
                    }}>
                      {log.entity_type}
                    </span>
                  </span>
                  <span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '999px',
                      background: `${actionColor}18`, color: actionColor,
                      fontSize: '11px', fontWeight: 600, border: `1px solid ${actionColor}30`,
                    }}>
                      {log.action}
                    </span>
                  </span>
                  <span style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px' }}>
                    {log.payload ? (isExpanded ? '▲' : '▼') : ''}
                  </span>
                </div>

                {isExpanded && log.payload && (
                  <div style={{
                    margin: '0 16px 12px',
                    padding: '12px 14px',
                    background: 'var(--gray-50)', borderRadius: '8px', border: '1px solid var(--border)',
                    fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {JSON.stringify(log.payload, null, 2)}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button
            disabled={page === 0}
            onClick={() => goToPage(page - 1)}
            style={{ ...btnOutline, opacity: page === 0 ? 0.4 : 1 }}
          >
            ← {t('pagination.prev')}
          </button>
          <span style={{ padding: '7px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
            {t('pagination.info', { page: page + 1, total: totalPages })}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => goToPage(page + 1)}
            style={{ ...btnOutline, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            {t('pagination.next')} →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)',
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 14px', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
}

const btnOutline: React.CSSProperties = {
  padding: '7px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
}
