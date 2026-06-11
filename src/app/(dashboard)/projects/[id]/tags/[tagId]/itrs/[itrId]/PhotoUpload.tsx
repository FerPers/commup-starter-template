'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { saveItrAttachment, deleteItrAttachment } from '@/app/actions/itr-instances'
import { createClient } from '@/lib/supabase/client'
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setUploadError(null)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${itrId}/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const supabase = createClient()
    const { error: upErr } = await supabase.storage.from('itr-attachments').upload(path, file)
    if (upErr) { setUploading(false); setUploadError(upErr.message); return }
    const { data: signed } = await supabase.storage.from('itr-attachments').createSignedUrl(path, 3600)
    const res = await saveItrAttachment({ itrId, itemId, storagePath: path, fileType: file.type, projectId, tagId })
    setUploading(false)
    if (res.error) { setUploadError(res.error); return }
    onAdded({ id: res.id!, item_id: itemId, file_url: path, file_type: file.type, captured_at: new Date().toISOString(), signed_url: signed?.signedUrl ?? null })
  }

  async function handleDelete(att: Attachment) {
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
