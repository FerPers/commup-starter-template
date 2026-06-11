'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createPunch } from '@/app/actions/punches'

export default function CreatePunchModal({
  itrId,
  itrItemId: _itrItemId,
  projectId,
  tagId,
  initialDescription,
  onClose,
  onCreated,
}: {
  itrId: string
  itrItemId: string | null
  projectId: string
  tagId: string
  initialDescription: string
  onClose: () => void
  onCreated: () => void
}) {
  const t = useTranslations('ItrExecution')
  const CATEGORY_CONFIG = {
    A: { label: t('punchModal.catA'), color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
    B: { label: t('punchModal.catB'), color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
    C: { label: t('punchModal.catC'), color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
  } as const

  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [targetDate, setTargetDate] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!description.trim()) { setError(t('punchModal.errorRequired')); return }
    setError(null)
    startTransition(async () => {
      const res = await createPunch({
        projectId,
        tagId,
        itrId,
        category,
        description: description.trim(),
        targetDate: targetDate || null,
      })
      if (res.error) { setError(res.error); return }
      onCreated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('punchModal.title')}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{t('punchModal.subtitle')}</p>

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>{t('punchModal.labelCategory')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(cat => {
              const cfg = CATEGORY_CONFIG[cat]
              const active = category === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: `2px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--card-bg)', color: active ? cfg.color : 'var(--text-muted)', cursor: 'pointer', textAlign: 'center' }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelDescription')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('punchModal.descPlaceholder')}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Target date */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelTargetDate')}</label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('punchModal.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{ padding: '9px 20px', background: isPending ? '#fed7aa' : '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'default' : 'pointer' }}
          >
            {isPending ? t('punchModal.registering') : t('punchModal.register')}
          </button>
        </div>
      </div>
    </div>
  )
}
