'use client'

import { useTranslations } from 'next-intl'

export default function TemplatePublishModal({
  nextVersion,
  isPending,
  onConfirm,
  onClose,
}: {
  nextVersion: number
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useTranslations('ItrTemplates.builder')

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>
          {t('publishVersionTitle')}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 6px' }}>
          {t('publishVersionDesc', { version: nextVersion })}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: '0 0 22px' }}>
          {t('publishVersionNote')}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('btnCancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{ padding: '8px 20px', background: '#1e40af', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? t('btnSaving') : t('btnPublishVersionConfirm', { version: nextVersion })}
          </button>
        </div>
      </div>
    </div>
  )
}
