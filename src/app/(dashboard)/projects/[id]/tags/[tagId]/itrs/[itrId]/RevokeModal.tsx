'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Signature } from './types'

export default function RevokeModal({
  itrNumber,
  signatures,
  isPending,
  revokeError,
  onClose,
  onRevoke,
}: {
  itrNumber: string
  signatures: Signature[]
  isPending: boolean
  revokeError: string | null
  onClose: () => void
  onRevoke: (reason: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 3 && !isPending

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: 'var(--card-bg)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
            {t('revoke.title', { itrNumber })}
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('revoke.body')}
          </p>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
          {t('revoke.signersAffected', { count: signatures.length })}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
            {t('revoke.reasonLabel')}
          </span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder={t('revoke.reasonPlaceholder')}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 }}
          />
        </label>

        {revokeError && (
          <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{revokeError}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-strong)', cursor: isPending ? 'wait' : 'pointer', fontWeight: 500 }}
          >
            {t('revoke.cancel')}
          </button>
          <button
            onClick={() => onRevoke(trimmed)}
            disabled={!canSubmit}
            style={{ padding: '8px 16px', background: canSubmit ? '#dc2626' : '#fca5a5', border: 'none', borderRadius: 8, fontSize: 13, color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            {isPending ? t('revoke.confirming') : t('revoke.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
