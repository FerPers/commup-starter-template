'use client'

import { useState, useRef, useTransition } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { registerPidDocument, deletePidDocument } from '@/app/actions/pid-documents'

type PidDoc = {
  id: string
  drawing_number: string
  title: string | null
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
  signed_url: string | null
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function PidDocumentsView({
  projectId,
  documents,
  missingPids,
  canEdit,
}: {
  projectId: string
  documents: PidDoc[]
  missingPids: string[]
  canEdit: boolean
}) {
  const t = useTranslations('PidDocuments')
  const locale = useLocale()
  const [showUpload, setShowUpload] = useState(false)
  const [docs, setDocs] = useState<PidDoc[]>(documents)
  const [missing, setMissing] = useState<string[]>(missingPids)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function handleUploaded(doc: PidDoc) {
    setDocs(prev => {
      const idx = prev.findIndex(d => d.drawing_number === doc.drawing_number)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = doc
        return next
      }
      return [...prev, doc].sort((a, b) => a.drawing_number.localeCompare(b.drawing_number))
    })
    setMissing(prev => prev.filter(p => p !== doc.drawing_number))
    setShowUpload(false)
  }

  function handleDeleted(id: string, drawingNumber: string) {
    setDocs(prev => prev.filter(d => d.id !== id))
    void drawingNumber
  }

  return (
    <div>
      {/* Missing P&IDs alert */}
      {missing.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
          padding: '14px 16px', marginBottom: '20px',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
              {t('list.missingAlert', { count: missing.length })}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {missing.map(p => (
                <span key={p} style={{
                  padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 600,
                  background: '#fef3c7', color: '#92400e', fontFamily: 'ui-monospace, monospace',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload panel */}
      {canEdit && (
        <div style={{ marginBottom: '20px' }}>
          {!showUpload ? (
            <button
              onClick={() => setShowUpload(true)}
              style={{
                padding: '9px 18px', background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('list.uploadBtn')}
            </button>
          ) : (
            <UploadForm
              projectId={projectId}
              missingPids={missing}
              onUploaded={handleUploaded}
              onCancel={() => setShowUpload(false)}
            />
          )}
        </div>
      )}

      {/* Documents list */}
      {docs.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>📄</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            {t('list.emptyTitle')}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>
            {t('list.emptyDesc')}
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <Th>{t('list.colDrawingNum')}</Th>
                <Th>{t('list.colTitle')}</Th>
                <Th>{t('list.colFile')}</Th>
                <Th>{t('list.colSize')}</Th>
                <Th>{t('list.colUploaded')}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  canEdit={canEdit}
                  projectId={projectId}
                  formatDate={formatDate}
                  onDeleted={handleDeleted}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DocRow({
  doc,
  canEdit,
  projectId,
  formatDate,
  onDeleted,
}: {
  doc: PidDoc
  canEdit: boolean
  projectId: string
  formatDate: (iso: string) => string
  onDeleted: (id: string, drawingNumber: string) => void
}) {
  const t = useTranslations('PidDocuments')
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      const res = await deletePidDocument({ id: doc.id, projectId, filePath: doc.file_path })
      if (res.error) {
        alert(res.error)
        return
      }
      onDeleted(doc.id, doc.drawing_number)
    })
  }

  return (
    <tr
      style={{ borderBottom: '1px solid #f1f5f9' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={tdStyle}>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 700,
          color: '#1e40af', background: '#eff6ff', padding: '3px 8px', borderRadius: '5px',
        }}>
          {doc.drawing_number}
        </span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{doc.title ?? '—'}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{doc.file_name}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{formatBytes(doc.file_size)}</span>
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{formatDate(doc.created_at)}</span>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <a
          href={`/projects/${projectId}/pid-documents/${doc.id}/viewer`}
          style={{
            padding: '5px 12px', fontSize: '12px', fontWeight: 500,
            background: '#eff6ff', color: '#2563eb', borderRadius: '6px',
            border: '1px solid #bfdbfe', textDecoration: 'none', marginRight: '8px',
            display: 'inline-block',
          }}
        >
          {t('list.openViewer')}
        </a>
        {doc.signed_url && (
          <a
            href={doc.signed_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '5px 12px', fontSize: '12px', fontWeight: 500,
              background: '#f0fdf4', color: '#16a34a', borderRadius: '6px',
              border: '1px solid #bbf7d0', textDecoration: 'none', marginRight: '8px',
            }}
          >
            {t('list.viewPdf')}
          </a>
        )}
        {canEdit && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: '5px 10px', fontSize: '12px', background: 'var(--card-bg)',
              color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            {t('list.deleteBtn')}
          </button>
        )}
        {canEdit && confirmDelete && (
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#ef4444' }}>{t('list.confirmQ')}</span>
            <button
              onClick={handleDelete}
              disabled={isPending}
              style={{
                padding: '4px 10px', fontSize: '12px', background: '#ef4444',
                color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer',
              }}
            >
              {isPending ? '...' : t('list.confirmYes')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: '4px 10px', fontSize: '12px', background: 'var(--card-bg)',
                color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '5px', cursor: 'pointer',
              }}
            >
              {t('list.confirmNo')}
            </button>
          </span>
        )}
      </td>
    </tr>
  )
}

function UploadForm({
  projectId,
  missingPids,
  onUploaded,
  onCancel,
}: {
  projectId: string
  missingPids: string[]
  onUploaded: (doc: PidDoc) => void
  onCancel: () => void
}) {
  const t = useTranslations('PidDocuments')
  const [file, setFile] = useState<File | null>(null)
  const [drawingNumber, setDrawingNumber] = useState('')
  const [title, setTitle] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError(t('upload.errPdfOnly'))
      return
    }
    setFile(f)
    setError(null)
    if (!drawingNumber) {
      setDrawingNumber(f.name.replace(/\.pdf$/i, ''))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError(t('upload.errNoFile')); return }
    if (!drawingNumber.trim()) { setError(t('upload.errNoDrawingNum')); return }

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()

      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${projectId}/${crypto.randomUUID()}-${safeFileName}`

      const { error: uploadError } = await supabase.storage
        .from('pid-documents')
        .upload(filePath, file, { contentType: 'application/pdf', upsert: false })

      if (uploadError) throw new Error(uploadError.message)

      const { data: signed } = await supabase.storage
        .from('pid-documents')
        .createSignedUrl(filePath, 3600)

      const res = await registerPidDocument({
        project_id: projectId,
        drawing_number: drawingNumber.trim(),
        title: title.trim() || null,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
      })
      if (res.error) throw new Error(res.error)

      onUploaded({
        id: crypto.randomUUID(),
        drawing_number: drawingNumber.trim(),
        title: title.trim() || null,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        created_at: new Date().toISOString(),
        signed_url: signed?.signedUrl ?? null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('upload.errUpload'))
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px',
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
        {t('upload.formTitle')}
      </h3>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : file ? '#10b981' : 'var(--border)'}`,
          borderRadius: '10px', padding: '32px', textAlign: 'center', cursor: 'pointer',
          background: dragging ? '#eff6ff' : file ? '#f0fdf4' : 'var(--gray-50)',
          marginBottom: '16px', transition: 'all 0.15s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {file ? (
          <>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>📄</div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>{file.name}</p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.4 }}>📂</div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              {t('upload.dropBefore')}{' '}
              <span style={{ color: '#3b82f6', fontWeight: 500 }}>{t('upload.dropSelect')}</span>
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--gray-400)' }}>{t('upload.dropHint')}</p>
          </>
        )}
      </div>

      {/* Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '4px' }}>
            {t('upload.fieldDrawingNum')} <span style={{ color: '#ef4444' }}>*</span>
          </label>
          {missingPids.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {missingPids.slice(0, 6).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDrawingNumber(p)}
                  style={{
                    padding: '2px 7px', fontSize: '10px', fontWeight: 600,
                    background: drawingNumber === p ? '#3b82f6' : '#eff6ff',
                    color: drawingNumber === p ? '#fff' : 'var(--primary-500)',
                    border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <input
            value={drawingNumber}
            onChange={e => setDrawingNumber(e.target.value)}
            placeholder="ECP-ULL-17004-P&ID-001"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '4px' }}>
            {t('upload.fieldTitle')}
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('upload.fieldTitlePlaceholder')}
            style={inputStyle}
          />
        </div>
      </div>

      {error && (
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="submit"
          disabled={uploading || !file}
          style={{
            padding: '9px 20px', background: uploading ? '#93c5fd' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: 500, cursor: uploading ? 'wait' : 'pointer',
          }}
        >
          {uploading ? t('upload.submitting') : t('upload.submit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          style={{
            padding: '9px 16px', background: 'var(--card-bg)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
          }}
        >
          {t('upload.cancel')}
        </button>
      </div>
    </form>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
      color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13px', color: 'var(--text-strong)',
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '7px',
  outline: 'none', boxSizing: 'border-box',
}