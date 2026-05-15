'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listPunchAttachments,
  addPunchAttachment,
  deletePunchAttachment,
  type PunchAttachmentRow,
} from '@/app/actions/punches'

interface Props {
  punchId: string
  projectId: string
  tagId: string
  onCountChange?: (count: number) => void
}

const NON_PREVIEWABLE_EXT = ['heic', 'heif']

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

export default function PunchPhotosSection({
  punchId,
  projectId,
  tagId,
  onCountChange,
}: Props) {
  const t = useTranslations('Tags.punches.photos')
  const [attachments, setAttachments] = useState<PunchAttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const res = await listPunchAttachments({ punchId })
    if (res.error) {
      setError(res.error)
      return
    }
    const list = res.attachments ?? []
    setAttachments(list)
    onCountChange?.(list.length)
  }, [punchId, onCountChange])

  useEffect(() => {
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [reload])

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${punchId}/${crypto.randomUUID()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('punch-attachments')
        .upload(path, file, { contentType: file.type })
      if (upErr) { setError(upErr.message); setUploading(false); return }

      const res = await addPunchAttachment({ punchId, storagePath: path, projectId, tagId })
      if (res.error) {
        // Roll back the upload to avoid orphaned objects in storage.
        await supabase.storage.from('punch-attachments').remove([path])
        setError(res.error)
        setUploading(false)
        return
      }
      await reload()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(att: PunchAttachmentRow) {
    if (!confirm(t('confirmDelete'))) return
    const res = await deletePunchAttachment({
      attachmentId: att.id,
      storagePath: att.file_url,
      projectId,
      tagId,
    })
    if (res.error) { setError(res.error); return }
    await reload()
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>
          {t('label', { count: attachments.length })}
        </label>
        <label
          htmlFor={`punch-photo-${punchId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            background: uploading ? 'var(--gray-100)' : 'var(--primary-500)',
            color: uploading ? 'var(--gray-400)' : '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 12, fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
          }}
        >
          <Camera size={14} aria-hidden="true" />
          {uploading ? t('uploading') : t('upload')}
        </label>
        <input
          ref={fileInputRef}
          id={`punch-photo-${punchId}`}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={uploading}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
          style={{ display: 'none' }}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('loading')}</p>
      ) : attachments.length === 0 ? (
        <p style={{
          fontSize: 12, color: 'var(--text-muted)',
          padding: '12px', background: 'var(--gray-50)',
          border: '1px dashed var(--border)', borderRadius: 6,
          margin: 0, textAlign: 'center',
        }}>
          {t('empty')}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {attachments.map(att => {
            const previewable = !NON_PREVIEWABLE_EXT.includes(extOf(att.file_url))
            return (
              <div
                key={att.id}
                style={{
                  position: 'relative', aspectRatio: '1 / 1',
                  background: 'var(--gray-100)', borderRadius: 6, overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                {previewable && att.signed_url ? (
                  <a href={att.signed_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from Supabase are 1h, Image optimizer would cache stale */}
                    <img
                      src={att.signed_url}
                      alt={att.uploaded_by_name ?? 'photo'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </a>
                ) : (
                  <a
                    href={att.signed_url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '100%', height: '100%',
                      fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none',
                      padding: 4, textAlign: 'center',
                    }}
                  >
                    {extOf(att.file_url).toUpperCase() || 'FILE'}
                  </a>
                )}
                {att.is_own && (
                  <button
                    type="button"
                    onClick={() => handleDelete(att)}
                    aria-label={t('delete')}
                    title={t('delete')}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 22, height: 22, padding: 0,
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      border: 'none', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p style={{
          fontSize: 12, color: '#ef4444', padding: '8px 12px',
          background: '#fee2e2', borderRadius: 6, margin: '8px 0 0',
        }}>
          {error}
        </p>
      )}
    </div>
  )
}
