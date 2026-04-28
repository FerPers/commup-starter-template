'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'

type TagRef = { id: string; tag_number: string } | null

type InterlockRow = {
  id: string
  interlock_number: string
  description: string
  set_point: string | null
  action: string | null
  subsystems: {
    id: string; code: string; name: string
    systems: { id: string; code: string; name: string; areas: { id: string; code: string; name: string } }
  } | null
  cause_tag: TagRef
  effect_tag: TagRef
}

export default function InterlocksView({
  projectId,
  projectName,
  interlocks,
}: {
  projectId: string
  projectName: string
  interlocks: InterlockRow[]
}) {
  const t = useTranslations('Signals')

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return interlocks
    const q = search.toLowerCase()
    return interlocks.filter(il =>
      il.interlock_number.toLowerCase().includes(q) ||
      il.description.toLowerCase().includes(q) ||
      (il.cause_tag?.tag_number ?? '').toLowerCase().includes(q) ||
      (il.effect_tag?.tag_number ?? '').toLowerCase().includes(q)
    )
  }, [interlocks, search])

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
          {t('interlocks.title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          {t('interlocks.subtitle', { count: interlocks.length })}
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder={t('interlocks.searchPlaceholder')}
          aria-label={t('interlocks.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: '400px', padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-strong)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {interlocks.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>⛓</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('interlocks.emptyTitle')}</p>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>{t('interlocks.emptyDesc')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
                  {[
                    t('interlocks.col.number'),
                    t('interlocks.col.description'),
                    t('interlocks.col.subsystem'),
                    t('interlocks.col.cause'),
                    t('interlocks.col.effect'),
                    t('interlocks.col.setPoint'),
                    t('interlocks.col.action'),
                  ].map(h => (
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
                ) : filtered.map((il, i) => {
                  const sub = il.subsystems
                  return (
                    <tr key={il.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--gray-50)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {il.interlock_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {il.description}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {sub ? (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-strong)' }}>{sub.code}</div>
                            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{sub.systems.areas.code} › {sub.systems.code}</div>
                          </div>
                        ) : '—'}
                      </td>

                      {/* Cause → Effect */}
                      <td style={{ padding: '10px 12px' }}>
                        {il.cause_tag ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 600,
                            background: '#fef3c720', color: '#d97706', border: '1px solid #fde68a',
                          }}>
                            {il.cause_tag.tag_number}
                          </span>
                        ) : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {il.effect_tag ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 600,
                            background: '#fee2e220', color: '#dc2626', border: '1px solid #fecaca',
                          }}>
                            {il.effect_tag.tag_number}
                          </span>
                        ) : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                      </td>

                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {il.set_point || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {il.action || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: 'var(--gray-50)', fontSize: '12px', color: 'var(--gray-400)' }}>
            {t('showing', { filtered: filtered.length, total: interlocks.length })}
          </div>
        </div>
      )}
    </div>
  )
}
