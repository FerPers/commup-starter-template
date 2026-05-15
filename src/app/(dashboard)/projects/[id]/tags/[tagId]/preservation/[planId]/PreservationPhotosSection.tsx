'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listPreservationAttachments,
  addPreservationAttachment,
  deletePreservationAttachment,
  type PreservationAttachmentRow,
} from '@/app/actions/preservation'

interface Props {
  recordId: string | null
  planId: string
  projectId: string
  tagId: string
  required?: boolean
  onCountChange?: (count: number) => void
}

const NON_PREVIEWABLE_EXT = ['heic', 'heif']

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

export default function PreservationPhotosSection({
  recordId,
  planId,
  projectId,
  tagId,
  required = false,
  onCountChange,
}: Props) {
  const t = useTranslations('PreservationExecution.photos')
  const [attachments, setAttachments] = useState<PreservationAttachmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    if (!recordId) {
      setAttachments([])
      onCountChange?.(0)
      return
    }
    const res = await listPreservationAttachments({ recordId })
    if (res.error) { setError(res.error); return }
    const list = res.attachments ?? []
    setAttachments(list)
    onCountChange?.(list.length)
  }, [recordId, onCountChange])

  useEffect(() => {
    if (!recordId) return
    setLoading(true)
    void reload().finally(() => setLoading(false))
  }, [reload, recordId])

  async function handleFile(file: File) {
    if (!recordId) { setError(t('errNoRecord')); return }
    setError(null)
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const path = `${recordId}/${crypto.randomUUID()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('preservation-attachments')
        .upload(path, file, { contentType: file.type })
      if (upErr) { setError(upErr.message); return }

      const res = await addPreservationAttachment({
        recordId, storagePath: path, fileType: file.type, projectId, tagId, planId,
      })
      if (res.error) {
        await supabase.storage.from('preservation-attachments').remove([path])
        setError(res.error)
        return
      }
      await reload()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(att: PreservationAttachmentRow) {
    if (!confirm(t('confirmDelete'))) return
    const res = await deletePreservationAttachment({
      attachmentId: att.id,
      storagePath: att.file_url,
      projectId, tagId, planId,
    })
    if (res.error) { setError(res.error); return }
    await reload()
  }

  const disabled = !recordId || uploading

  return (
    <div style={{
      marginBottom: 14,
      padding: '12px 14px',
      background: required && attachments.length === 0 ? '#fffbeb' : 'var(--card-bg)',
      border: `1px solid ${required && attachments.length === 0 ? '#fde68a' : 'var(--border)'}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>
            {t(required ? 'labelRequired' : 'labelOptional', { count: attachments.length })}
          </label>
          {!recordId && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('hintStartRecord')}
            </div>
          )}
        </div>
        <label
          htmlFor={`pres-photo-${planId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            background: disabled ? 'var(--gray-100)' : 'var(--primary-500)',
            color: disabled ? 'var(--gray-400)' : '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 12, fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <Camera size={14} aria-hidden="true" />
          {uploading ? t('uploading') : t('upload')}
        </label>
        <input
          ref={fileInputRef}
          id={`pres-photo-${planId}`}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
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
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {required ? t('emptyRequired') : t('emptyOptional')}
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
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs 1h TTL; Image optimizer would cache stale */}
                    <img
                      src={att.signed_url}
                      alt="preservation evidence"
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
