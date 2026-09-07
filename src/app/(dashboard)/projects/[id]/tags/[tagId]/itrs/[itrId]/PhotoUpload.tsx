'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { deleteItrAttachment } from '@/app/actions/itr-instances'
import { uploadOrQueuePhoto, discardPendingPhoto } from '@/lib/sync/outbox'
import type { Attachment } from './types'

export default function PhotoUpload({
  itrId,
  itemId,
  projectId,
  tagId,
  existingAttachments,
  canEdit,
  onAdded,
  onRemoved,
}: {
  itrId: string
  itemId: string
  projectId: string
  tagId: string
  existingAttachments: Attachment[]
  canEdit: boolean
  onAdded: (att: Attachment) => void
  onRemoved: (attId: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [queuedHint, setQueuedHint] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setUploadError(null)
    setQueuedHint(false)
    // Sprint O: sin red la foto queda en la bandeja de salida (IndexedDB) y se
    // sube al reconectar; la miniatura pendiente llega por el evento de la bandeja.
    const res = await uploadOrQueuePhoto({ itrId, itemId, projectId, tagId, fileName: file.name, fileType: file.type, blob: file })
    setUploading(false)
    if ('error' in res) { setUploadError(res.error); return }
    if (res.queued) { setQueuedHint(true); return }
    onAdded(res.attachment)
  }

  async function handleDelete(att: Attachment) {
    if (att.pending) {
      await discardPendingPhoto(att.id)
      return   // la miniatura desaparece con el evento de la bandeja
    }
    const res = await deleteItrAttachment({ attachmentId: att.id, storagePath: att.file_url, projectId, tagId, itrId })
    if (res.error) { setUploadError(res.error); return }
    onRemoved(att.id)
  }

  return (
    <div style={{ marginTop: '4px' }}>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      {/* Thumbnails */}
      {existingAttachments.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {existingAttachments.map(att => (
            <div key={att.id} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              {att.signed_url
                // eslint-disable-next-line @next/next/no-img-element -- Supabase signed URL with rotating token, Image cache would break
                ? <img src={att.signed_url} alt={t('upload.photoAlt')} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => setLightbox(att.signed_url)} />
                : <div style={{ width: '100%', height: '100%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📷</div>
              }
              {att.pending && (
                <span title={t('upload.queuedHint')} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 0', background: 'rgba(245,158,11,0.9)', color: '#fff', fontSize: '9px', fontWeight: 700, textAlign: 'center', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  ⏳ {t('upload.pending')}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => handleDelete(att)}
                  style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {canEdit && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ padding: '7px 14px', background: uploading ? '#eff6ff' : '#f0fdf4', border: '1px dashed #86efac', borderRadius: '7px', fontSize: '12px', color: uploading ? '#3b82f6' : '#15803d', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          {uploading ? t('upload.uploading') : t('upload.addPhoto')}
        </button>
      )}

      {uploadError && (
        <p style={{ fontSize: '11px', color: '#ef4444', margin: '4px 0 0' }}>{uploadError}</p>
      )}
      {queuedHint && (
        <p style={{ fontSize: '11px', color: '#b45309', margin: '4px 0 0' }}>{t('upload.queuedHint')}</p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase signed URL lightbox, optimizer adds no value */}
          <img src={lightbox} alt={t('upload.photoFullAlt')} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
