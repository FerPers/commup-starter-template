'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { reviewPunchCategory, updatePunchClassification } from '@/app/actions/punches'
import {
  PUNCH_IMPACTS,
  STARTUP_DISPOSITIONS,
  STARTUP_DISPOSITION_HELP,
  categoryMismatch,
  type PunchCategory,
  type PunchImpact,
  type StartupDisposition,
} from '@/lib/punches/category-guide'
import { ROLE_TIERS } from '@/lib/constants/roles'

// Clasificación del punch en el detalle (fase 4 · bloque A): impacto, disposición para el arranque
// y revisión de la categoría por un supervisor distinto de quien lo levantó (marca + cola, §10.4).

export type ClassifiablePunch = {
  id: string
  status: string
  category: PunchCategory
  raised_by: string | null
  impact: string | null
  startup_disposition: string | null
  category_reviewed_at: string | null
}

const REVIEWERS = ROLE_TIERS.editor
const sel: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px',
  background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit',
}
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)' }
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-600)' : 'var(--card-bg)', color: primary ? '#fff' : 'var(--text-strong)',
})

export function PunchClassification({ punch, projectId, tagId, userId, role, onUpdated }: {
  punch: ClassifiablePunch
  projectId: string
  tagId?: string | null
  userId: string
  role: string
  onUpdated: () => void
}) {
  const t = useTranslations('PunchGuide')
  const lang = useLocale() === 'en' ? 'en' : 'es'
  const [newCat, setNewCat] = useState<PunchCategory>(punch.category)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const open = punch.status !== 'closed' && punch.status !== 'cancelled'
  const canEdit = open && role !== 'client'
  const canReview = open && REVIEWERS.includes(role) && punch.raised_by !== userId && !punch.category_reviewed_at
  const impact = (punch.impact ?? null) as PunchImpact | null
  const suggested = categoryMismatch(impact, punch.category)
  const base = { punchId: punch.id, projectId, tagId: tagId ?? null }

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      setNote('')
      onUpdated()
    })
  }

  return (
    <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
          <span style={{ ...small, fontWeight: 600 }}>{t('impactLabel')}</span>
          <select style={sel} value={impact ?? ''} disabled={!canEdit || isPending}
            onChange={e => run(() => updatePunchClassification({ ...base, impact: (e.target.value || null) as PunchImpact | null }))}>
            <option value="">{t('noImpact')}</option>
            {PUNCH_IMPACTS.map(i => <option key={i} value={i}>{t(`impact.${i}`)}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
          <span style={{ ...small, fontWeight: 600 }}>{t('dispositionLabel')}</span>
          <select style={sel} value={punch.startup_disposition ?? ''} disabled={!canEdit || isPending}
            onChange={e => run(() => updatePunchClassification({ ...base, startupDisposition: (e.target.value || null) as StartupDisposition | null }))}>
            <option value="">{t('noDisposition')}</option>
            {STARTUP_DISPOSITIONS.map(d => <option key={d} value={d}>{t(`disposition.${d}`)}</option>)}
          </select>
          {punch.startup_disposition && <span style={small}>{STARTUP_DISPOSITION_HELP[punch.startup_disposition as StartupDisposition]?.[lang]}</span>}
        </label>
      </div>

      {suggested && <div style={{ ...small, color: 'var(--warning-800)' }}>{t('mismatch', { chosen: punch.category, suggested, impact: t(`impact.${impact!}`) })}</div>}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        {punch.category_reviewed_at ? (
          <span style={{ ...small, color: 'var(--success-700)', fontWeight: 600 }}>✓ {t('reviewed')}</span>
        ) : (
          <span style={{ ...small, color: 'var(--warning-700)', fontWeight: 600 }}>{t('unreviewed')}</span>
        )}
        {canReview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={sel} value={newCat} onChange={e => setNewCat(e.target.value as PunchCategory)} aria-label={t('reviewCategory')}>
                {(['A', 'B', 'C'] as const).map(c => <option key={c} value={c}>Cat {c}</option>)}
              </select>
              <input style={{ ...sel, flex: 1, minWidth: '160px' }} value={note} onChange={e => setNote(e.target.value)}
                placeholder={newCat === punch.category ? t('reviewNoteOptional') : t('reviewNoteRequired')} />
            </div>
            <div>
              <button type="button" style={btn(true, isPending || (newCat !== punch.category && !note.trim()))}
                disabled={isPending || (newCat !== punch.category && !note.trim())}
                onClick={() => run(() => reviewPunchCategory({ ...base, category: newCat, note }))}>
                {newCat === punch.category ? t('confirmCategory', { cat: newCat }) : t('recategorize', { from: punch.category, to: newCat })}
              </button>
            </div>
          </div>
        )}
        {!punch.category_reviewed_at && open && REVIEWERS.includes(role) && punch.raised_by === userId && (
          <div style={{ ...small, marginTop: '4px' }}>{t('reviewByOther')}</div>
        )}
      </div>
      {error && <div role="alert" style={{ fontSize: '12px', color: 'var(--danger-700)' }}>{error}</div>}
    </div>
  )
}
