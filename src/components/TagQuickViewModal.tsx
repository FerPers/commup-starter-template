'use client'

import { useId } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import { alpha, ink } from '@/lib/theme'

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)',  bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-700)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-700)', bg: 'var(--success-50)' },
  on_hold:     { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
}

export interface TagQuickViewData {
  id: string
  tag_number: string
  description: string
  status: string
  discipline: { code: string; color: string; name: string }
  open_punches_a: number
  open_punches_b: number
  itr_completion_pct: number
}

interface Props {
  tag: TagQuickViewData
  projectId: string
  onClose: () => void
}

export default function TagQuickViewModal({ tag, projectId, onClose }: Props) {
  const tx = useTranslations('TagQuickView')
  const titleId = useId()
  const statusKey = tag.status in STATUS_CONFIG ? tag.status : 'not_started'
  const status = STATUS_CONFIG[statusKey]
  const pct = Math.round(tag.itr_completion_pct)

  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <DialogSurface onClose={onClose} labelledBy={titleId}
        style={{
          background: 'white',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--gray-100)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div id={titleId} style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text-strong)',
                letterSpacing: '-0.5px',
              }}>
                {tag.tag_number}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                {tag.description}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={tx('close')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1,
                padding: '0 0 0 12px', flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
              background: alpha(tag.discipline.color, 9),
              color: ink(tag.discipline.color),
            }}>
              {tag.discipline.code} · {tag.discipline.name}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
              background: status.bg, color: ink(status.color),
            }}>
              {tx(`status.${statusKey}`)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {/* ITR Progress */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{tx('itrProgress')}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: pct === 100 ? 'var(--success-700)' : 'var(--text-strong)' }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: pct === 100 ? 'var(--success-500)' : 'var(--primary-500)',
                borderRadius: '999px',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Punch counts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <span style={{
              padding: '4px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              background: tag.open_punches_a > 0 ? 'var(--danger-50)' : 'var(--success-50)',
              color: tag.open_punches_a > 0 ? 'var(--danger-700)' : 'var(--success-700)',
              border: `1px solid ${tag.open_punches_a > 0 ? 'var(--danger-200)' : 'var(--success-200)'}`,
            }}>
              Cat A: {tag.open_punches_a}
            </span>
            <span style={{
              padding: '4px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              background: tag.open_punches_b > 0 ? 'var(--warning-50)' : 'var(--success-50)',
              color: tag.open_punches_b > 0 ? 'var(--warning-700)' : 'var(--success-700)',
              border: `1px solid ${tag.open_punches_b > 0 ? 'var(--warning-200)' : 'var(--success-200)'}`,
            }}>
              Cat B: {tag.open_punches_b}
            </span>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href={`/projects/${projectId}/tags?view=cards&tag=${tag.id}`}
              style={{
                flex: 1, textAlign: 'center',
                padding: '9px 12px',
                background: 'var(--primary-50)', color: 'var(--primary-700)',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', border: '1px solid var(--primary-200)',
              }}
            >
              🔷 Digital Twin
            </Link>
            <Link
              href={`/projects/${projectId}/tags/${tag.id}`}
              style={{
                flex: 1, textAlign: 'center',
                padding: '9px 12px',
                background: 'var(--gray-900)', color: 'white',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              {tx('viewDetail')}
            </Link>
          </div>
        </div>
      </DialogSurface>
    </div>
  )
}
