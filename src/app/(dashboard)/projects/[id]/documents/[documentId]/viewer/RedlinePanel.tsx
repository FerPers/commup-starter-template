'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAskDialog } from '@/components/ui'
import { addRedlineComment, registerRedlinePhoto, redlinePhotoUrls, reviewRedline } from '@/app/actions/pid-redlines'
import { canReviewRedline, countByStatus, REDLINE_STATUSES, REDLINE_STATUS_STYLE, REJECT_MIN, type RedlineStatus } from '@/lib/pid/redlines'
import { formatInZone } from '@/lib/time/zone'
import TagSelector from './TagSelector'
import type { RedlineView, SystemRef, TagItem } from './types'

// F-21a (maquetas aprobadas): panel derecho del visor para los red-lines. Formulario del red-line en curso (qué
// cambió, sistema, tag y fotos), texto de una marca «Texto», lista de la revisión con filtros por estado y el detalle
// (fotos, comentarios, aceptar / rechazar con motivo). Crea y revisa Líder en adelante (revisa otra persona); comenta
// cualquier miembro.

const MAX_PHOTO = 10 * 1024 * 1024
const box: React.CSSProperties = { margin: '12px 16px 0', padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 10 }
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-strong)' }
const btn = (kind: 'primary' | 'plain' | 'danger' | 'success'): React.CSSProperties => ({
  minHeight: 44, padding: '0 16px', borderRadius: 10, fontSize: 14, fontWeight: kind === 'plain' ? 500 : 700, cursor: 'pointer', fontFamily: 'inherit',
  border: kind === 'plain' ? '1px solid var(--border)' : kind === 'danger' ? '1px solid var(--danger-200)' : 0,
  background: kind === 'primary' ? 'var(--primary-600)' : kind === 'success' ? 'var(--success-600)' : 'var(--card-bg)',
  color: kind === 'primary' || kind === 'success' ? '#fff' : kind === 'danger' ? 'var(--danger-700)' : 'var(--text-strong)',
})

export function statusChip(status: RedlineStatus, label: string) {
  const s = REDLINE_STATUS_STYLE[status]
  return <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: s.chipBg, color: s.chipText, border: `1px solid ${s.chipBorder}`, whiteSpace: 'nowrap' }}>{label}</span>
}

/** Sube fotos al bucket redline-photos (<project>/<redline>/…) y las registra. */
async function uploadPhotos(files: File[], ids: { projectId: string; documentId: string; redlineId: string }, tooBig: (name: string) => string): Promise<string | null> {
  for (const file of files) {
    if (file.size > MAX_PHOTO) return tooBig(file.name)
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${ids.projectId}/${ids.redlineId}/${crypto.randomUUID()}.${ext}`
    const { error } = await createClient().storage.from('redline-photos').upload(path, file, { contentType: file.type || 'image/jpeg' })
    if (error) return error.message
    const res = await registerRedlinePhoto({
      project_id: ids.projectId, document_id: ids.documentId, redline_id: ids.redlineId,
      file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
    })
    if (res.error) return res.error
  }
  return null
}

/** Formulario del red-line en curso (se abre con «Terminar marcas»). */
export function RedlineDraftPanel({
  markCount, systemList, defaultSystemId, projectId, busy, onSave, onDiscard, onBack,
}: {
  markCount: number
  systemList: SystemRef[]
  defaultSystemId: string | null
  projectId: string
  busy: boolean
  onSave: (v: { description: string; system_id: string | null; tag: TagItem | null; photos: File[] }) => void
  onDiscard: () => void
  /** Volver a dibujar (seguir agregando marcas). */
  onBack: () => void
}) {
  const t = useTranslations('PidDocuments')
  const descId = useId()
  const sysId = useId()
  const [description, setDescription] = useState('')
  const [systemId, setSystemId] = useState<string | null>(defaultSystemId)
  const [tag, setTag] = useState<TagItem | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const ok = description.trim().length >= 3
  return (
    <section aria-label={t('redline.newTitle')} style={{ ...box, borderColor: 'var(--danger-200)' }}>
      <strong style={{ fontSize: 16, color: 'var(--text-strong)' }}>{t('redline.newTitle')}</strong>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('redline.marksCount', { count: markCount })}</span>
      <label htmlFor={descId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{t('redline.description')}</label>
      <textarea id={descId} value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000}
        placeholder={t('redline.descriptionPlaceholder')} style={{ ...field, resize: 'vertical' }} />
      <label htmlFor={sysId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{t('redline.system')}</label>
      <select id={sysId} value={systemId ?? ''} onChange={e => setSystemId(e.target.value || null)} style={{ ...field, minHeight: 44 }}>
        <option value="">{t('redline.noSystem')}</option>
        {systemList.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
      </select>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{t('redline.tag')}</span>
      <TagSelector projectId={projectId} value={tag} onChange={setTag} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{t('redline.photos')}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {photos.map((f, i) => (
          <span key={`${f.name}-${i}`} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'var(--gray-100)', color: 'var(--text-body)', display: 'flex', gap: 6, alignItems: 'center' }}>
            {f.name}
            <button type="button" aria-label={t('redline.removePhoto', { name: f.name })} onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>×</button>
          </span>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} style={btn('plain')}>{t('redline.addPhoto')}</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple aria-label={t('redline.addPhoto')} style={{ display: 'none' }}
          onChange={e => { const fs = Array.from(e.target.files ?? []); setPhotos(p => [...p, ...fs]); e.target.value = '' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('redline.staysOpen')}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onDiscard} disabled={busy} style={btn('plain')}>{t('redline.discard')}</button>
        <button type="button" onClick={onBack} disabled={busy} style={btn('plain')}>{t('redline.keepDrawing')}</button>
        <button type="button" disabled={!ok || busy} onClick={() => onSave({ description: description.trim(), system_id: systemId, tag, photos })}
          style={{ ...btn('primary'), flex: 1, opacity: ok && !busy ? 1 : 0.5 }}>{busy ? '…' : t('redline.save')}</button>
      </div>
    </section>
  )
}

/** Texto de una marca «Texto» recién ubicada. */
export function RedlineTextPrompt({ onAdd, onCancel }: { onAdd: (text: string) => void; onCancel: () => void }) {
  const t = useTranslations('PidDocuments')
  const id = useId()
  const [text, setText] = useState('')
  return (
    <section aria-label={t('redline.textTitle')} style={{ ...box, borderColor: 'var(--danger-200)' }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{t('redline.textTitle')}</label>
      <input id={id} value={text} onChange={e => setText(e.target.value)} maxLength={120} autoFocus style={{ ...field, minHeight: 44 }}
        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) onAdd(text.trim()) }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btn('plain')}>{t('viewer.cancel')}</button>
        <button type="button" disabled={!text.trim()} onClick={() => onAdd(text.trim())} style={{ ...btn('primary'), flex: 1, opacity: text.trim() ? 1 : 0.5 }}>{t('redline.addText')}</button>
      </div>
    </section>
  )
}

/** Lista de la revisión (filtros por estado) y detalle del elegido. */
export function RedlineListPanel({
  redlines, selectedId, onSelect, currentPage, onGoToPage, systems, names, userId, canEdit, projectId, documentId, timezone,
}: {
  redlines: RedlineView[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  currentPage: number
  onGoToPage: (page: number) => void
  systems: Map<string, SystemRef>
  names: Record<string, string>
  userId: string
  canEdit: boolean
  projectId: string
  documentId: string
  timezone: string | null
}) {
  const t = useTranslations('PidDocuments')
  const [filter, setFilter] = useState<RedlineStatus | null>(null)
  const counts = countByStatus(redlines)
  const shown = redlines.filter(r => !filter || r.status === filter)
  const selected = redlines.find(r => r.id === selectedId) ?? null
  if (redlines.length === 0) return null
  return (
    <section aria-label={t('redline.listTitle')} style={{ margin: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong style={{ fontSize: 14, color: 'var(--text-strong)' }}>{t('redline.listTitle')}</strong>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {REDLINE_STATUSES.map(s => {
          const on = filter === s
          const st = REDLINE_STATUS_STYLE[s]
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => setFilter(on ? null : s)}
              style={{ minHeight: 34, padding: '0 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${on ? st.chipText : 'var(--border)'}`, background: on ? st.chipBg : 'var(--card-bg)', color: on ? st.chipText : 'var(--text-body)', fontWeight: on ? 600 : 400 }}>
              {t(`redline.status_${s}`)} {counts[s]}
            </button>
          )
        })}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => { onSelect(r.id === selectedId ? null : r.id); if (r.page_num !== currentPage) onGoToPage(r.page_num) }}
              aria-pressed={r.id === selectedId}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: 8, alignItems: 'center',
                border: `${r.id === selectedId ? 2 : 1}px solid ${r.id === selectedId ? REDLINE_STATUS_STYLE[r.status].chipText : 'var(--border)'}`, background: 'var(--card-bg)' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>{r.number}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
              {r.page_num !== currentPage && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('redline.sheet', { page: r.page_num })}</span>}
              {statusChip(r.status, t(`redline.status_${r.status}`))}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <RedlineDetail key={selected.id} redline={selected} systems={systems} names={names} userId={userId} canEdit={canEdit}
          projectId={projectId} documentId={documentId} timezone={timezone} onClose={() => onSelect(null)} />
      )}
    </section>
  )
}

function RedlineDetail({
  redline: r, systems, names, userId, canEdit, projectId, documentId, timezone, onClose,
}: {
  redline: RedlineView
  systems: Map<string, SystemRef>
  names: Record<string, string>
  userId: string
  canEdit: boolean
  projectId: string
  documentId: string
  timezone: string | null
  onClose: () => void
}) {
  const t = useTranslations('PidDocuments')
  const locale = useLocale()
  const router = useRouter()
  const { dialog, ask } = useAskDialog()
  const commentId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<{ id: string; url: string; name: string }[] | null>(null)
  const when = (iso: string) => formatInZone(iso, timezone, locale)
  const who = (id: string | null) => (id ? names[id] ?? '—' : '—')
  const ids = { projectId, documentId, redlineId: r.id }

  useEffect(() => {
    if (r.photo_count === 0) return
    let live = true
    void redlinePhotoUrls({ project_id: projectId, redline_id: r.id }).then(res => { if (live) { if (res.photos) setPhotos(res.photos); else if (res.error) setError(res.error) } })
    return () => { live = false }
  }, [r.id, r.photo_count, projectId])

  async function review(accept: boolean) {
    // El motivo se pide FUERA de la transición: dentro, React retiene el diálogo hasta que la acción termina.
    let note: string | null = null
    if (!accept) {
      note = await ask({ title: t('redline.rejectTitle', { number: r.number }), confirmLabel: t('redline.reject'), danger: true,
        input: { label: t('redline.rejectReason'), minLength: REJECT_MIN, multiline: true } })
      if (note === null) return
    }
    startTransition(async () => {
      const res = await reviewRedline({ project_id: projectId, document_id: documentId, redline_id: r.id, accept, note })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function sendComment() {
    const body = comment.trim()
    if (!body) return
    startTransition(async () => {
      const res = await addRedlineComment({ project_id: projectId, document_id: documentId, redline_id: r.id, body })
      if (res.error) { setError(res.error); return }
      setComment('')
      router.refresh()
    })
  }

  function addPhotos(files: FileList | null) {
    if (!files?.length) return
    startTransition(async () => {
      const err = await uploadPhotos(Array.from(files), ids, name => t('redline.photoTooBig', { name }))
      if (fileRef.current) fileRef.current.value = ''
      if (err) { setError(err); return }
      router.refresh()
    })
  }

  const sys = r.system_id ? systems.get(r.system_id) : null
  const reviewable = canReviewRedline(r, userId, canEdit)
  return (
    <div style={{ ...box, margin: '4px 0 0', borderColor: REDLINE_STATUS_STYLE[r.status].chipBorder }}>
      {dialog}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, color: 'var(--text-strong)' }}>{r.number}</strong>
        {statusChip(r.status, t(`redline.status_${r.status}`))}
        <button type="button" onClick={onClose} aria-label={t('redline.close')}
          style={{ marginLeft: 'auto', minWidth: 36, minHeight: 36, border: 0, background: 'transparent', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', whiteSpace: 'pre-wrap' }}>{r.description}</p>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {[sys?.code, who(r.created_by), when(r.created_at)].filter(Boolean).join(' · ')}
      </span>
      {r.reviewed_at && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {t(r.status === 'rejected' ? 'redline.rejectedBy' : 'redline.acceptedBy', { who: who(r.reviewed_by), when: when(r.reviewed_at) })}
          {r.review_note ? ` — ${r.review_note}` : ''}
        </span>
      )}

      {(photos?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photos!.map(p => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" title={p.name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de storage, no optimizable por next/image */}
              <img src={p.url} alt={p.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
            </a>
          ))}
        </div>
      )}
      {canEdit && (r.status === 'open' || r.status === 'accepted') && (
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={isPending} style={btn('plain')}>{t('redline.addPhoto')}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple aria-label={t('redline.addPhoto')} style={{ display: 'none' }}
            onChange={e => addPhotos(e.target.files)} />
        </div>
      )}

      <strong style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{t('redline.comments', { count: r.comments.length })}</strong>
      {r.comments.map(c => (
        <div key={c.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-body)' }}>
          <strong style={{ color: 'var(--text-strong)' }}>{who(c.created_by)}</strong> · <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{when(c.created_at)}</span>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.body}</div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <label htmlFor={commentId} className="sr-only">{t('redline.commentLabel')}</label>
        <input id={commentId} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('redline.commentPlaceholder')} maxLength={2000}
          onKeyDown={e => { if (e.key === 'Enter') sendComment() }} style={{ ...field, minHeight: 44, flex: 1 }} />
        <button type="button" onClick={sendComment} disabled={!comment.trim() || isPending} style={{ ...btn('plain'), opacity: comment.trim() ? 1 : 0.5 }}>{t('redline.send')}</button>
      </div>

      {reviewable && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void review(false)} disabled={isPending} style={{ ...btn('danger'), flex: 1 }}>{t('redline.reject')}…</button>
            <button type="button" onClick={() => void review(true)} disabled={isPending} style={{ ...btn('success'), flex: 1 }}>{t('redline.accept')}</button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('redline.reviewHint')}</span>
        </>
      )}
      {canEdit && r.status === 'open' && r.created_by === userId && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('redline.ownHint')}</span>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--danger-700)' }}>{error}</p>}
    </div>
  )
}

export { uploadPhotos }
