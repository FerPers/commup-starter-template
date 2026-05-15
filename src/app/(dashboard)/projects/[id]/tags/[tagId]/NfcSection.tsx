'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Radio, X, Smartphone } from 'lucide-react'
import { linkNfcToTag, unlinkNfc } from '@/app/actions/tags'

interface Props {
  projectId: string
  tagId: string
  nfcUid: string | null
  canEdit: boolean
}

export default function NfcSection({ projectId, tagId, nfcUid, canEdit }: Props) {
  const t = useTranslations('Tags.nfc')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: nfcUid ? '#dcfce7' : 'var(--gray-100)',
            color: nfcUid ? '#16a34a' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Radio size={16} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>
            {t('cardLabel')}
          </div>
          {nfcUid ? (
            <div
              style={{
                fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
                color: 'var(--text-strong)',
                marginTop: 2,
                wordBreak: 'break-all',
              }}
            >
              {nfcUid}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('notLinkedHint')}
            </div>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              padding: '6px 12px',
              background: nfcUid ? 'var(--gray-100)' : 'var(--primary-500)',
              color: nfcUid ? 'var(--text-muted)' : '#fff',
              border: nfcUid ? '1px solid var(--border)' : 'none',
              borderRadius: 7,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {nfcUid ? t('manageBtn') : t('linkBtn')}
          </button>
        )}
      </div>

      {modalOpen && (
        <LinkNfcModal
          projectId={projectId}
          tagId={tagId}
          currentUid={nfcUid}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

interface NDEFReadingEvent extends Event {
  serialNumber?: string
}

interface NDEFReaderLike {
  scan: () => Promise<void>
  addEventListener: (event: 'reading' | 'readingerror', handler: (e: NDEFReadingEvent) => void) => void
}

function LinkNfcModal({
  projectId, tagId, currentUid, onClose,
}: {
  projectId: string
  tagId: string
  currentUid: string | null
  onClose: () => void
}) {
  const t = useTranslations('Tags.nfc')
  const router = useRouter()
  const [uid, setUid] = useState(currentUid ?? '')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Web NFC: Chrome Android only. Detect at render time.
  const hasWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window

  async function handleNfcRead() {
    setError(null)
    setScanning(true)
    try {
      const Ctor = (window as unknown as { NDEFReader: new () => NDEFReaderLike }).NDEFReader
      const reader = new Ctor()
      await reader.scan()
      reader.addEventListener('reading', (event: NDEFReadingEvent) => {
        if (event.serialNumber) {
          setUid(event.serialNumber)
          setScanning(false)
        }
      })
      reader.addEventListener('readingerror', () => {
        setError(t('errReadFailed'))
        setScanning(false)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errReadFailed'))
      setScanning(false)
    }
  }

  function handleLink() {
    setError(null)
    startTransition(async () => {
      const res = await linkNfcToTag({ projectId, tagId, nfcUid: uid })
      if (res.error) {
        setError(res.conflictTagNumber
          ? t('errConflict', { tag: res.conflictTagNumber })
          : res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  function handleUnlink() {
    if (!confirm(t('confirmUnlink'))) return
    setError(null)
    startTransition(async () => {
      const res = await unlinkNfc({ projectId, tagId })
      if (res.error) { setError(res.error); return }
      router.refresh()
      onClose()
    })
  }

  const dirty = uid.trim() !== (currentUid ?? '')

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--card-bg)', borderRadius: 14,
        padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
              {currentUid ? t('modalTitleEdit') : t('modalTitleLink')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {t('modalDescription')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('modalClose')}
            style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--gray-400)', cursor: 'pointer' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>
          {t('labelUid')}
        </label>
        <input
          type="text"
          value={uid}
          onChange={e => setUid(e.target.value)}
          placeholder={t('placeholderUid')}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 11px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13, fontFamily: 'ui-monospace, monospace',
            marginBottom: 8,
          }}
        />

        {hasWebNfc && (
          <button
            type="button"
            onClick={handleNfcRead}
            disabled={scanning || isPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              background: 'var(--gray-100)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 7,
              fontSize: 12, fontWeight: 600,
              cursor: scanning ? 'wait' : 'pointer',
              marginBottom: 12,
            }}
          >
            <Smartphone size={14} aria-hidden="true" />
            {scanning ? t('scanning') : t('scanWithPhone')}
          </button>
        )}
        {!hasWebNfc && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            {t('webNfcUnavailable')}
          </p>
        )}

        {error && (
          <p style={{
            fontSize: 12, color: '#ef4444',
            padding: '8px 12px', background: '#fee2e2',
            borderRadius: 6, margin: '0 0 12px',
          }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {currentUid && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isPending}
              style={{
                padding: '8px 14px',
                background: 'transparent', color: '#ef4444',
                border: '1px solid #fecaca', borderRadius: 7,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                marginRight: 'auto',
              }}
            >
              {t('btnUnlink')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 14px',
              background: 'var(--gray-100)', color: 'var(--text-muted)',
              border: 'none', borderRadius: 7,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('btnCancel')}
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={isPending || !uid.trim() || !dirty}
            style={{
              padding: '8px 14px',
              background: !isPending && uid.trim() && dirty ? 'var(--primary-500)' : 'var(--gray-100)',
              color: !isPending && uid.trim() && dirty ? '#fff' : 'var(--gray-400)',
              border: 'none', borderRadius: 7,
              fontSize: 12, fontWeight: 600,
              cursor: !isPending && uid.trim() && dirty ? 'pointer' : 'not-allowed',
            }}
          >
            {isPending ? t('btnSaving') : t('btnSave')}
          </button>
        </div>
      </div>
    </div>
  )
}
