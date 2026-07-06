'use client'

// Pantalla de ejecución de ITR — orquestador (Q2). El estado de autosave vive
// en useItrAutosave; los bloques de UI (ItemRow, PhotoUpload, SignModal,
// RevokeModal, CreatePunchModal, MicAppend) son componentes hermanos.

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { signItr, saveItrAttachment, revokeItrApproval } from '@/app/actions/itr-instances'
import { createClient } from '@/lib/supabase/client'
import { useItrAutosave } from './useItrAutosave'
import ItemRow from './ItemRow'
import SignModal from './SignModal'
import RevokeModal from './RevokeModal'
import CreatePunchModal from './CreatePunchModal'
import { isItemVisible, type Attachment, type ItrData } from './types'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'

export default function ItrExecution({
  itr,
  projectId,
  tagId,
  currentUserId: _currentUserId,
  currentUserRole,
  canEdit,
  attachments: initialAttachments = [],
}: {
  itr: ItrData
  projectId: string
  tagId: string
  currentUserId: string
  currentUserRole: string
  canEdit: boolean
  attachments?: Attachment[]
}) {
  const router = useRouter()
  const t = useTranslations('ItrExecution')
  const locale = useLocale()
  const [isModalPending, startModalTransition] = useTransition()
  const [itemLang, setItemLang] = useState<'es' | 'en'>(() => {
    if (typeof window === 'undefined') return locale.startsWith('es') ? 'es' : 'en'
    const stored = window.localStorage.getItem('commup-itr-item-lang')
    if (stored === 'es' || stored === 'en') return stored
    return locale.startsWith('es') ? 'es' : 'en'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('commup-itr-item-lang', itemLang)
    }
  }, [itemLang])
  const [showSignModal, setShowSignModal] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [showPunchModal, setShowPunchModal] = useState(false)
  const [punchItemDesc, setPunchItemDesc] = useState('')
  const [punchItrItemId, setPunchItrItemId] = useState<string | null>(null)

  // ── Autosave + responses optimistas + offline ───────────────────────
  const { responses, saveResponse, lastSaved, saveError, isPending, isOffline, pendingCount, syncing } =
    useItrAutosave(itr)

  // Attachments state — keyed by itemId or 'general'
  const [attachmentMap, setAttachmentMap] = useState<Record<string, Attachment[]>>(() => {
    const map: Record<string, Attachment[]> = {}
    for (const a of initialAttachments) {
      const key = a.item_id ?? 'general'
      ;(map[key] ??= []).push(a)
    }
    return map
  })

  const addAttachment = useCallback((itemId: string | null, att: Attachment) => {
    const key = itemId ?? 'general'
    setAttachmentMap(prev => ({ ...prev, [key]: [...(prev[key] ?? []), att] }))
  }, [])

  const removeAttachment = useCallback((itemId: string | null, attachmentId: string) => {
    const key = itemId ?? 'general'
    setAttachmentMap(prev => ({ ...prev, [key]: (prev[key] ?? []).filter(a => a.id !== attachmentId) }))
  }, [])

  const generalPhotoInputRef = useRef<HTMLInputElement>(null)
  const [generalUploading, setGeneralUploading] = useState(false)
  const [generalUploadError, setGeneralUploadError] = useState<string | null>(null)

  const template = itr.itr_templates
  const tag = itr.tags
  const phase = itr.project_phases
  const st = ITR_STATUS_COLORS[itr.status] ?? ITR_STATUS_COLORS.not_started

  // Status + role labels (i18n)
  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    completed:    t('status.completed'),
    approved:     t('status.approved'),
    rejected:     t('status.rejected'),
  }

  // Sorted sections + items
  const sections = template?.itr_template_sections
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map(s => ({
      ...s,
      itr_template_items: s.itr_template_items
        .slice()
        .sort((a, b) => a.order_index - b.order_index),
    })) ?? []

  const allItems = sections.flatMap(s => s.itr_template_items)
  const visibleItems = allItems.filter(item => isItemVisible(item, responses))
  const criticalBlocked = visibleItems.filter(
    item => item.is_critical && responses[item.id]?.is_passed === false,
  )
  const executor = itr.itr_assignments.find(a => a.role === 'executor')

  // ── Sign ────────────────────────────────────────────────────────────

  function handleSign(role: 'executor' | 'supervisor' | 'client', signatureImage: string) {
    setSignError(null)
    startModalTransition(async () => {
      const res = await signItr(itr.id, role, projectId, tagId, signatureImage)
      if (res.error) { setSignError(res.error); return }
      setShowSignModal(false)
      router.refresh()
    })
  }

  // ── Revoke approval ─────────────────────────────────────────────────

  function handleRevoke(reason: string) {
    setRevokeError(null)
    startModalTransition(async () => {
      const res = await revokeItrApproval({ itrId: itr.id, projectId, tagId, reason })
      if (res.error) { setRevokeError(res.error); return }
      setShowRevokeModal(false)
      router.refresh()
    })
  }

  const canRevoke = ['owner', 'admin', 'architect'].includes(currentUserRole) && itr.status === 'approved'

  // ── Punch ────────────────────────────────────────────────────────────

  function openPunchModal(itemDesc: string, itemId: string | null = null) {
    setPunchItemDesc(itemDesc)
    setPunchItrItemId(itemId)
    setShowPunchModal(true)
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>

      {/* Back nav */}
      <div style={{ padding: '20px 20px 0' }}>
        <a href={`/projects/${projectId}/tags/${tagId}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← {tag?.tag_number} / ITRs
        </a>
      </div>

      {/* Header card */}
      <div style={{ margin: '16px 20px 0', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {phase && (
                <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                  {phase.code}
                </span>
              )}
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                {itr.itr_number}
              </span>
            </div>
            {template && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{template.title}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '1px 6px' }}>
                  v{template.version}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div
              role="group"
              aria-label="Idioma de los ítems"
              style={{ display: 'inline-flex', padding: '2px', borderRadius: '8px', background: 'var(--gray-50)', border: '1px solid var(--border)' }}
            >
              {(['es', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setItemLang(l)}
                  aria-pressed={itemLang === l}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: itemLang === l ? 'var(--card-bg)' : 'transparent',
                    color: itemLang === l ? 'var(--text-strong)' : 'var(--text-muted)',
                    boxShadow: itemLang === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                  title={l === 'es' ? 'Mostrar ítems en español' : 'Show items in English'}
                >
                  {l}
                </button>
              ))}
            </div>
            <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
              {STATUS_LABELS[itr.status] ?? itr.status}
            </span>
          </div>
        </div>

        {/* Tag info row */}
        {tag && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: 'var(--gray-700)' }}>{t('header.tagLabel')}</strong>{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', color: tag.disciplines?.color ?? '#374151' }}>{tag.tag_number}</span>
              {' — '}{tag.description}
            </span>
            {executor?.profiles?.full_name && (
              <span><strong style={{ color: 'var(--gray-700)' }}>{t('header.inspectorLabel')}</strong> {executor.profiles.full_name}</span>
            )}
            {itr.scheduled_date && (
              <span><strong style={{ color: 'var(--gray-700)' }}>{t('header.dateLabel')}</strong> {itr.scheduled_date}</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--gray-400)', marginBottom: '5px' }}>
            <span>{t('header.progress')}</span>
            <span>{itr.progress_pct}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '4px', transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Signatures status */}
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['executor', 'supervisor', 'client'] as const).map(role => {
            const sig = itr.itr_signatures.find(s => s.role === role)
            const signedDate = sig ? sig.signed_at.slice(0, 10).split('-').reverse().join('/') : null
            const signedTime = sig ? sig.signed_at.slice(11, 16) : null
            return (
              <div key={role} style={{ borderRadius: '7px', background: sig ? '#ecfdf5' : 'var(--gray-50)', border: `1px solid ${sig ? '#a7f3d0' : 'var(--border)'}`, overflow: 'hidden', minWidth: '130px' }}>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: sig ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px' }}>{sig ? '✓' : '○'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: sig ? '#10b981' : 'var(--gray-400)' }}>{t(`roles.${role}` as Parameters<typeof t>[0])}</span>
                  </div>
                  {sig && (
                    <>
                      <div style={{ fontSize: '11px', color: 'var(--gray-700)', fontWeight: 500, marginLeft: '17px' }}>
                        {sig.profiles?.full_name ?? '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginLeft: '17px', marginTop: '1px' }}>
                        {signedDate} {signedTime}
                      </div>
                    </>
                  )}
                </div>
                {sig?.signature_image && (
                  <div style={{ borderTop: '1px solid #a7f3d0', padding: '4px 6px', background: '#f0fdf4' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- base64 signature data URL, Image optimizer doesn't apply */}
                    <img src={sig.signature_image} alt={t(`roles.${role}` as Parameters<typeof t>[0])} style={{ height: '36px', maxWidth: '140px', objectFit: 'contain', display: 'block' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Critical blockers warning */}
        {criticalBlocked.length > 0 && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', margin: '0 0 4px' }}>
              {t('criticalBlocked', { count: criticalBlocked.length })}
            </p>
            {criticalBlocked.map(item => {
              const desc = itemLang === 'es' ? (item.description_es?.trim() ?? item.description) : item.description
              return (
                <p key={item.id} style={{ fontSize: '11px', color: '#7f1d1d', margin: '2px 0' }}>
                  • {item.item_number ? `${item.item_number} ` : ''}{desc}
                </p>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sections + Items ─────────────────────────────────────────── */}
      <div style={{ padding: '0 20px' }}>
        {sections.map(section => (
          <div key={section.id} style={{ marginTop: '20px' }}>
            <div style={{ padding: '10px 16px', background: 'var(--gray-50)', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {section.title}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {section.itr_template_items.filter(item => isItemVisible(item, responses)).map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  response={responses[item.id] ?? null}
                  canEdit={canEdit}
                  onSave={saveResponse}
                  onAddPunch={openPunchModal}
                  itrId={itr.id}
                  projectId={projectId}
                  tagId={tagId}
                  itemAttachments={attachmentMap[item.id] ?? []}
                  onAttachmentAdded={att => addAttachment(item.id, att)}
                  onAttachmentRemoved={attId => removeAttachment(item.id, attId)}
                  lang={itemLang}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sticky footer ──────────────────────────────────────────── */}
      {/* Hidden file input for general (non-item) photos */}
      <input
        ref={generalPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0]
          if (!file) return
          e.target.value = ''
          setGeneralUploading(true)
          setGeneralUploadError(null)
          const ext = file.name.split('.').pop() ?? 'jpg'
          const path = `${itr.id}/general/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const supabase = createClient()
          const { error: upErr } = await supabase.storage.from('itr-attachments').upload(path, file)
          if (upErr) { setGeneralUploading(false); setGeneralUploadError(upErr.message); return }
          const { data: signed } = await supabase.storage.from('itr-attachments').createSignedUrl(path, 3600)
          const res = await saveItrAttachment({ itrId: itr.id, itemId: null, storagePath: path, fileType: file.type, projectId, tagId })
          setGeneralUploading(false)
          if (res.error) { setGeneralUploadError(res.error); return }
          addAttachment(null, { id: res.id!, item_id: null, file_url: path, file_type: file.type, captured_at: new Date().toISOString(), signed_url: signed?.signedUrl ?? null })
        }}
      />

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card-bg)', borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', zIndex: 100 }}>
        <div style={{ fontSize: '11px', color: isOffline ? '#f59e0b' : syncing ? '#3b82f6' : isPending ? '#3b82f6' : lastSaved ? '#10b981' : 'var(--gray-400)' }}>
          {isOffline && pendingCount > 0
            ? t('footer.offlineWithPending', { count: pendingCount })
            : isOffline
            ? t('footer.offline')
            : syncing
            ? t('footer.syncing')
            : isPending
            ? t('footer.saving')
            : saveError
            ? `⚠ ${saveError}`
            : lastSaved
            ? t('footer.saved', { time: lastSaved.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })
            : t('footer.autoSave')}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => openPunchModal('')}
            style={{ padding: '9px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '13px', color: '#c2410c', cursor: 'pointer', fontWeight: 600 }}
          >
            {t('footer.btnPunch')}
          </button>
          <button
            onClick={() => generalPhotoInputRef.current?.click()}
            disabled={!canEdit || generalUploading}
            title={generalUploadError ?? t('upload.addPhoto')}
            style={{ padding: '9px 16px', background: generalUploading ? '#eff6ff' : '#f0fdf4', border: `1px solid ${generalUploadError ? '#fca5a5' : '#bbf7d0'}`, borderRadius: '8px', fontSize: '13px', color: generalUploading ? '#3b82f6' : '#15803d', cursor: canEdit && !generalUploading ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {generalUploading ? '⏳' : '📷'} {(attachmentMap['general'] ?? []).length > 0 ? t('footer.btnPhotos', { count: (attachmentMap['general'] ?? []).length }) : t('footer.btnPhoto')}
          </button>
          {(() => {
            const canSign = canEdit && itr.status === 'completed'
            const signTooltip =
              itr.status === 'approved'   ? t('footer.signTooltipApproved')
              : itr.status === 'rejected' ? t('footer.signTooltipRejected')
              : itr.status !== 'completed' ? t('footer.signTooltipIncomplete')
              : ''
            return (
              <button
                onClick={() => setShowSignModal(true)}
                disabled={!canSign}
                title={signTooltip || undefined}
                style={{ padding: '9px 20px', background: !canSign ? 'var(--gray-50)' : '#7c3aed', color: !canSign ? 'var(--gray-400)' : 'var(--card-bg)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !canSign ? 'not-allowed' : 'pointer' }}
              >
                {t('footer.btnSign')}
              </button>
            )
          })()}
          {itr.status === 'approved' && (
            <a
              href={`/projects/${projectId}/tags/${tagId}/itrs/${itr.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '9px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', color: '#15803d', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              ⬇ {t('footer.btnPdf')}
            </a>
          )}
          {canRevoke && (
            <button
              onClick={() => { setRevokeError(null); setShowRevokeModal(true) }}
              style={{ padding: '9px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#b91c1c', fontWeight: 600, cursor: 'pointer' }}
            >
              {t('footer.btnRevoke')}
            </button>
          )}
        </div>
      </div>

      {/* ── Punch Modal ─────────────────────────────────────────────── */}
      {showPunchModal && (
        <CreatePunchModal
          itrId={itr.id}
          itrItemId={punchItrItemId}
          projectId={projectId}
          tagId={tagId}
          initialDescription={punchItemDesc}
          onClose={() => setShowPunchModal(false)}
          onCreated={() => { setShowPunchModal(false); router.refresh() }}
        />
      )}

      {/* ── Sign Modal ──────────────────────────────────────────────── */}
      {showSignModal && (
        <SignModal
          itrNumber={itr.itr_number}
          itrSignatures={itr.itr_signatures}
          criticalBlocked={criticalBlocked}
          isPending={isModalPending}
          signError={signError}
          onClose={() => setShowSignModal(false)}
          onSign={handleSign}
        />
      )}

      {/* ── Revoke Modal ────────────────────────────────────────────── */}
      {showRevokeModal && (
        <RevokeModal
          itrNumber={itr.itr_number}
          signatures={itr.itr_signatures}
          isPending={isModalPending}
          revokeError={revokeError}
          onClose={() => setShowRevokeModal(false)}
          onRevoke={handleRevoke}
        />
      )}
    </div>
  )
}
