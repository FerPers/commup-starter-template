'use client'

// Panel de firmas del PSSR — extraído de PssrReviewForm.tsx (Q4).

import { useTranslations } from 'next-intl'
import type { ReviewStatus, Signature } from './pssr-review-shared'

export default function PssrSignaturesPanel({
  sigs,
  reviewStatus,
  readonly,
  currentUserId,
  onOpenSign,
  onRemoveSig,
}: {
  sigs: Signature[]
  reviewStatus: ReviewStatus
  readonly: boolean
  currentUserId: string
  onOpenSign: () => void
  onRemoveSig: (sigId: string) => void
}) {
  const t = useTranslations('PSSR')

  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            {t('review.signaturesTitle')}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {t('review.signaturesSubtitle')}
          </p>
        </div>
        {!readonly && reviewStatus !== 'draft' && (
          <button
            onClick={onOpenSign}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            {t('review.signBtn')}
          </button>
        )}
      </div>

      {sigs.length === 0 ? (
        <div style={{
          padding: '28px', textAlign: 'center', background: 'var(--gray-50)',
          borderRadius: '8px', border: '1.5px dashed #e2e8f0',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>
            {reviewStatus === 'draft'
              ? t('review.signEmptyDraft')
              : t('review.signEmpty')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {sigs.map(sig => (
            <div key={sig.id} style={{
              border: '1px solid var(--border)', borderRadius: '10px', padding: '12px',
              background: 'var(--gray-50)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signature_data is a base64 data: URL, next/image doesn't handle data URLs without a custom loader */}
              <img
                src={sig.signature_data}
                alt="Firma"
                style={{ width: '100%', height: '80px', objectFit: 'contain', background: 'var(--card-bg)', borderRadius: '6px', border: '1px solid #f1f5f9' }}
              />
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {sig.profiles?.full_name ?? t('review.signUserFallback')}
                </div>
                {sig.discipline && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sig.discipline}</div>
                )}
                <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>
                  {new Date(sig.signed_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {!readonly && sig.user_id === currentUserId && (
                <button
                  onClick={() => onRemoveSig(sig.id)}
                  style={{
                    marginTop: '6px', padding: '3px 8px', borderRadius: '5px', fontSize: '10px',
                    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer',
                  }}
                >
                  {t('review.removeSig')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
