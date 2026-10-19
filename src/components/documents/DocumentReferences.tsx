'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDocumentReference, removeDocumentReference, updateDocumentReference } from '@/app/actions/documents'
import { REVALIDATION_MIN, type ReferenceKind } from '@/lib/documents/catalog'

// Documentos que referencia un ITR o una revisión de procedimiento (fase 8, sesión 1; doc §15.3–15.4).
// Revisión superada: bloquea firmar/aprobar mientras el registro está abierto («Actualizar»); si ya está
// firmado/aprobado, un líder+ lo revalida con motivo y el gate del sistema queda en amarillo hasta entonces.

export type DocumentRef = {
  id: string
  document_id: string
  number: string
  title: string
  used_rev: string
  current_rev: string | null
  outdated: boolean
  revalidated_at: string | null
  revalidated_from_rev: string | null
  revalidation_reason: string | null
}
export type DocumentOption = { id: string; number: string; title: string; current_rev: string | null }

const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 10 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)' }
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-500)' : 'var(--card-bg)', color: primary ? '#fff' : 'var(--text-strong)',
})

export default function DocumentReferences({ projectId, kind, targetId, refs, options, locked, canEdit, canRevalidate }: {
  projectId: string
  kind: ReferenceKind
  targetId: string
  refs: DocumentRef[]
  options: DocumentOption[]
  /** ITR con alguna firma / procedimiento fuera de borrador. */
  locked: boolean
  /** Miembro no-client. */
  canEdit: boolean
  /** Líder+ (revalidar un registro firmado). */
  canRevalidate: boolean
}) {
  const t = useTranslations('Documents')
  const router = useRouter()
  const path = usePathname()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const used = new Set(refs.map(r => r.document_id))
  const available = options.filter(o => !used.has(o.id) && o.current_rev)
  const outdated = refs.filter(r => r.outdated)

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  return (
    <section style={box} aria-labelledby={`docrefs-${targetId}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 id={`docrefs-${targetId}`} style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{t('refs.title')}</h3>
        <Link href={`/projects/${projectId}/documents`} style={{ ...small, color: 'var(--primary-600, #2563eb)', textDecoration: 'none' }}>{t('refs.register')}</Link>
      </div>

      {outdated.length > 0 && (
        <div role="alert" style={{ padding: '8px 12px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>
          {locked ? t('refs.outdatedLocked', { n: outdated.length }) : t(kind === 'itr' ? 'refs.outdatedItr' : 'refs.outdatedProc', { n: outdated.length })}
        </div>
      )}
      {error && <div role="alert" style={{ ...small, color: 'var(--danger-700)' }}>{error}</div>}

      {refs.length === 0 ? (
        <p style={{ ...small, margin: 0 }}>{t('refs.empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {refs.map(r => (
            <li key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/projects/${projectId}/documents/${r.document_id}`} style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: 'none' }}>{r.number}</Link>
                <span style={small}>{r.title}</span>
                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  background: r.outdated ? 'var(--danger-50)' : 'var(--success-50)', color: r.outdated ? 'var(--danger-700)' : 'var(--success-700)',
                  border: `1px solid ${r.outdated ? '#fecaca' : '#a7f3d0'}`,
                }}>
                  {r.outdated ? t('refs.outdatedChip', { used: r.used_rev, current: r.current_rev ?? '—' }) : t('refs.currentChip', { rev: r.used_rev })}
                </span>
                <span style={{ flex: 1 }} />
                {r.outdated && canEdit && !locked && (
                  <button type="button" disabled={isPending} style={btn(true)}
                    onClick={() => run(() => updateDocumentReference({ projectId, referenceId: r.id, path }))}>{t('refs.update')}</button>
                )}
                {r.outdated && locked && canRevalidate && reasonFor !== r.id && (
                  <button type="button" disabled={isPending} style={btn(true)} onClick={() => { setReasonFor(r.id); setReason('') }}>{t('refs.revalidate')}</button>
                )}
                {canEdit && !locked && (
                  <button type="button" disabled={isPending} style={btn(false)}
                    onClick={() => run(() => removeDocumentReference({ projectId, referenceId: r.id, path }))}>{t('refs.remove')}</button>
                )}
              </div>
              {r.revalidated_at && (
                <span style={{ ...small, fontSize: 'var(--text-xs)' }}>
                  {t('refs.revalidated', { from: r.revalidated_from_rev ?? '—', to: r.used_rev })}: {r.revalidation_reason}
                </span>
              )}
              {reasonFor === r.id && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...input, flex: 1, minWidth: 220 }} value={reason} aria-label={t('refs.reason')}
                    placeholder={t('refs.reasonPh', { n: REVALIDATION_MIN })} onChange={e => setReason(e.target.value)} />
                  <button type="button" disabled={isPending || reason.trim().length < REVALIDATION_MIN} style={btn(true)}
                    onClick={() => run(() => updateDocumentReference({ projectId, referenceId: r.id, reason, locked: true, path }), () => setReasonFor(null))}>
                    {t('refs.confirm')}
                  </button>
                  <button type="button" style={btn(false)} onClick={() => setReasonFor(null)}>{t('cancel')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !locked && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...input, flex: 1, minWidth: 220 }} value={pick} aria-label={t('refs.add')} onChange={e => setPick(e.target.value)}>
            <option value="">{available.length ? t('refs.pick') : t('refs.none')}</option>
            {available.map(o => <option key={o.id} value={o.id}>{o.number} · {o.title} (Rev {o.current_rev})</option>)}
          </select>
          <button type="button" disabled={isPending || !pick} style={btn(true)}
            onClick={() => run(() => addDocumentReference({ projectId, kind, targetId, documentId: pick, path }), () => setPick(''))}>{t('refs.add')}</button>
        </div>
      )}
      {locked && <p style={{ ...small, margin: 0, fontSize: 'var(--text-xs)' }}>{t(kind === 'itr' ? 'refs.lockedItr' : 'refs.lockedProc')}</p>}
    </section>
  )
}
