'use client'

import { useState } from 'react'
import { createHref } from '@/lib/create/catalog'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { punchDisplayStatus } from '@/lib/punches/verification'
import { canRaisePunch } from '@/lib/constants/punch-roles'
import { ink } from '@/lib/theme'
import { PUNCH_CATEGORY_CFG as CATEGORY_CFG, PUNCH_STATUS_COLORS as STATUS_COLORS } from '@/lib/constants/status-colors'

// N1b: el detalle de cada punch es su página propia (/projects/[id]/punches/[punchId]); aquí la lista y el alta.

// ── Types ──────────────────────────────────────────────────────────────

export type TagPunch = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: 'critical' | 'major' | 'minor'
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  assigned_to: string | null
  raised_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_profile: { full_name: string } | null
  raised_by: string | null
  impact: string | null
  startup_disposition: string | null
  category_reviewed_at: string | null
}


// ── Main component ──────────────────────────────────────────────────────

export default function TagPunchTab({
  punches,
  projectId,
  tagId,
  currentUserRole,
}: {
  punches: TagPunch[]
  projectId: string
  tagId: string
  currentUserRole: string
}) {
  const t = useTranslations('Tags')
  const tGuide = useTranslations('PunchGuide')
  // N3b: el alta es la página propia del punch, con el tag precargado y la vuelta a esta pestaña.
  const newHref = createHref('punch', { projectId, tagId, systemId: null })
  const canRaise = canRaisePunch(currentUserRole)
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')

  const displayed = filterCat ? punches.filter(p => p.category === filterCat) : punches

  if (punches.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚑</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-body)', margin: '0 0 6px' }}>{t('punches.emptyTitle')}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{t('punches.emptyMsg')}</p>
        {canRaise && <Link
          href={newHref}
          style={{ display: 'inline-block', padding: '9px 18px', background: 'var(--orange-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
        >
          {t('punches.newPunch')}
        </Link>}
      </div>
    )
  }

  return (
    <div>
      {/* Summary pills (clickable — toggle category filter) */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['A', 'B', 'C'] as const).map(cat => {
          const cfg = CATEGORY_CFG[cat]
          const count = punches.filter(p => p.category === cat).length
          const active = filterCat === cat
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterCat(prev => prev === cat ? '' : cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', minHeight: '36px', font: 'inherit',
                borderRadius: '8px', cursor: 'pointer',
                background: active ? cfg.bg : 'var(--card-bg)',
                border: `1.5px solid ${active ? cfg.color : cfg.border}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: ink(cfg.color) }}>{cfg.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: ink(cfg.color) }}>{count}</span>
            </button>
          )
        })}
        <div style={{ marginLeft: 'auto' }}>
          {canRaise && <Link
            href={newHref}
            style={{ display: 'inline-block', padding: '6px 14px', background: 'var(--orange-600)', color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
          >
            {t('punches.newPunch')}
          </Link>}
        </div>
      </div>

      {/* Punch list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayed.map(punch => {
          const catCfg = CATEGORY_CFG[punch.category]
          const displayStatus = punchDisplayStatus(punch)
          const stColors = STATUS_COLORS[displayStatus] ?? STATUS_COLORS.open
          const stLabel = t(`punches.status.${displayStatus}` as Parameters<typeof t>[0])
          return (
            <Link
              key={punch.id}
              href={`/projects/${projectId}/punches/${punch.id}`}
              style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', borderLeft: `4px solid ${catCfg.color}` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', fontWeight: 600 }}>{punch.punch_number}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: ink(catCfg.color), border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: ink(stColors.color) }}>{stLabel}</span>
                    {!punch.category_reviewed_at && punch.status !== 'closed' && punch.status !== 'cancelled' && (
                      <span style={{ fontSize: '10px', color: 'var(--warning-700)' }}>{tGuide('unreviewedShort')}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-strong)', margin: '0 0 4px', lineHeight: '1.4' }}>{punch.description}</p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    {punch.assigned_to_profile && <span>👤 {punch.assigned_to_profile.full_name}</span>}
                    {punch.target_date && <span>📅 {punch.target_date}</span>}
                    {punch.itr_id && <span>↗ ITR</span>}
                  </div>
                </div>
                <span aria-hidden style={{ fontSize: '11px', color: 'var(--text-muted)' }}>›</span>
              </div>
            </Link>
          )
        })}
      </div>

    </div>
  )
}
