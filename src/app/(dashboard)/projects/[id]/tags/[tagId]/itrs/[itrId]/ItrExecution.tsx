'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { signItr, saveItrAttachment, deleteItrAttachment } from '@/app/actions/itr-instances'
import { createPunch } from '@/app/actions/punches'
import { createClient } from '@/lib/supabase/client'
import { useOfflineSync } from '@/hooks/useOfflineSync'

// ── Types ─────────────────────────────────────────────────────────────

type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no'

type Item = {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_critical: boolean
  is_required: boolean
  requires_photo: boolean
  requires_measurement: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  options: string[] | null
  order_index: number
  condition_item_id: string | null
  condition_value: string | null
}

type Section = {
  id: string
  title: string
  order_index: number
  itr_template_items: Item[]
}

type Response = {
  id: string
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
  responded_at: string | null
}

type Signature = {
  id: string
  role: string
  signed_at: string
  user_id: string
  signature_image: string | null
  profiles: { full_name: string } | null
}

type Attachment = {
  id: string
  item_id: string | null
  file_url: string      // storage path
  file_type: string
  captured_at: string
  signed_url: string | null
}

type ItrData = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  template_id: string
  project_id: string
  tag_id: string | null
  itr_templates: {
    id: string
    code: string
    title: string
    version: number
    itr_template_sections: Section[]
  } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ id: string; user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_responses: Response[]
  itr_signatures: Signature[]
}

// ── Status config (colors only) ───────────────────────────────────────

const ITR_STATUS: Record<string, { color: string; bg: string }> = {
  not_started: { color: '#64748b', bg: '#f1f5f9' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff' },
  completed:    { color: '#10b981', bg: '#ecfdf5' },
  approved:     { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { color: '#ef4444', bg: '#fee2e2' },
}

// ── Helpers ───────────────────────────────────────────────────────────

function computeIsPassed(value: number, min: number | null, max: number | null): boolean | null {
  if (min === null && max === null) return null
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

function isItemVisible(item: Item, responses: Record<string, Response>): boolean {
  if (!item.condition_item_id) return true
  const condResp = responses[item.condition_item_id]
  if (!condResp) return false
  const actual = String(
    condResp.value_bool !== null ? condResp.value_bool
    : condResp.value_option !== null ? condResp.value_option
    : condResp.value_text !== null ? condResp.value_text
    : condResp.value_numeric !== null ? condResp.value_numeric
    : '',
  )
  return actual === item.condition_value
}

// ── Main component ────────────────────────────────────────────────────

export default function ItrExecution({
  itr,
  projectId,
  tagId,
  currentUserId: _currentUserId,
  currentUserRole: _currentUserRole,
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
  const [isPending, startTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showSignModal, setShowSignModal] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [showPunchModal, setShowPunchModal] = useState(false)
  const [punchItemDesc, setPunchItemDesc] = useState('')
  const [punchItrItemId, setPunchItrItemId] = useState<string | null>(null)
  const savingRef = useRef(false)

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

  // ── Offline sync ─────────────────────────────────────────────────────
  const { isOffline, pendingCount, syncing, saveWithQueue } = useOfflineSync(itr.id, itr.template_id)

  // Persist a full snapshot to IndexedDB so the ITR can be viewed offline
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@/lib/offline-queue').then(({ saveItrSnapshot }) => {
        saveItrSnapshot(itr.id, itr).catch(() => {})
      })
    }
  }, [itr])

  const template = itr.itr_templates
  const tag = itr.tags
  const phase = itr.project_phases
  const st = ITR_STATUS[itr.status] ?? ITR_STATUS.not_started

  // Status + role labels (i18n)
  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    completed:    t('status.completed'),
    approved:     t('status.approved'),
    rejected:     t('status.rejected'),
  }

  // Build response lookup by item_id
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    return map
  })

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
  const criticalBlocked = allItems.filter(
    item => item.is_critical && responses[item.id]?.is_passed === false,
  )
  const executor = itr.itr_assignments.find(a => a.role === 'executor')

  // ── Auto-save ───────────────────────────────────────────────────────

  const saveResponse = useCallback((
    itemId: string,
    data: {
      valueText?: string | null
      valueNumeric?: number | null
      valueBool?: boolean | null
      valueOption?: string | null
      remarks?: string | null
      isPassed?: boolean | null
    },
  ) => {
    setSaveError(null)
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }), ...data },
    }))
    if (savingRef.current) return
    savingRef.current = true
    startTransition(async () => {
      const res = await saveWithQueue(itemId, data)
      savingRef.current = false
      if (res.queued) { return }           // offline — optimistic UI already set
      if (res.error) { setSaveError(res.error); return }
      setLastSaved(new Date())
      router.refresh()
    })
  }, [saveWithQueue, router])

  // ── Sign ────────────────────────────────────────────────────────────

  function handleSign(role: 'executor' | 'supervisor' | 'client', signatureImage: string) {
    setSignError(null)
    startTransition(async () => {
      const res = await signItr(itr.id, role, projectId, tagId, signatureImage)
      if (res.error) { setSignError(res.error); return }
      setShowSignModal(false)
      router.refresh()
    })
  }

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
        <a href={`/projects/${projectId}/tags/${tagId}`} style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          ← {tag?.tag_number} / ITRs
        </a>
      </div>

      {/* Header card */}
      <div style={{ margin: '16px 20px 0', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {phase && (
                <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                  {phase.code}
                </span>
              )}
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                {itr.itr_number}
              </span>
            </div>
            {template && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#475569' }}>{template.title}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '1px 6px' }}>
                  v{template.version}
                </span>
              </div>
            )}
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
            {STATUS_LABELS[itr.status] ?? itr.status}
          </span>
        </div>

        {/* Tag info row */}
        {tag && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: '#374151' }}>{t('header.tagLabel')}</strong>{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', color: tag.disciplines?.color ?? '#374151' }}>{tag.tag_number}</span>
              {' — '}{tag.description}
            </span>
            {executor?.profiles?.full_name && (
              <span><strong style={{ color: '#374151' }}>{t('header.inspectorLabel')}</strong> {executor.profiles.full_name}</span>
            )}
            {itr.scheduled_date && (
              <span><strong style={{ color: '#374151' }}>{t('header.dateLabel')}</strong> {itr.scheduled_date}</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '5px' }}>
            <span>{t('header.progress')}</span>
            <span>{itr.progress_pct}%</span>
          </div>
          <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
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
              <div key={role} style={{ borderRadius: '7px', background: sig ? '#ecfdf5' : '#f8fafc', border: `1px solid ${sig ? '#a7f3d0' : '#e2e8f0'}`, overflow: 'hidden', minWidth: '130px' }}>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: sig ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px' }}>{sig ? '✓' : '○'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: sig ? '#10b981' : '#94a3b8' }}>{t(`roles.${role}` as Parameters<typeof t>[0])}</span>
                  </div>
                  {sig && (
                    <>
                      <div style={{ fontSize: '11px', color: '#374151', fontWeight: 500, marginLeft: '17px' }}>
                        {sig.profiles?.full_name ?? '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '17px', marginTop: '1px' }}>
                        {signedDate} {signedTime}
                      </div>
                    </>
                  )}
                </div>
                {sig?.signature_image && (
                  <div style={{ borderTop: '1px solid #a7f3d0', padding: '4px 6px', background: '#f0fdf4' }}>
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
            {criticalBlocked.map(item => (
              <p key={item.id} style={{ fontSize: '11px', color: '#7f1d1d', margin: '2px 0' }}>
                • {item.item_number ? `${item.item_number} ` : ''}{item.description}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── Sections + Items ─────────────────────────────────────────── */}
      <div style={{ padding: '0 20px' }}>
        {sections.map(section => (
          <div key={section.id} style={{ marginTop: '20px' }}>
            <div style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', zIndex: 100 }}>
        <div style={{ fontSize: '11px', color: isOffline ? '#f59e0b' : syncing ? '#3b82f6' : isPending ? '#3b82f6' : lastSaved ? '#10b981' : '#94a3b8' }}>
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
          <button
            onClick={() => setShowSignModal(true)}
            disabled={!canEdit || itr.status === 'approved'}
            style={{ padding: '9px 20px', background: !canEdit || itr.status === 'approved' ? '#f8fafc' : '#7c3aed', color: !canEdit || itr.status === 'approved' ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !canEdit || itr.status === 'approved' ? 'not-allowed' : 'pointer' }}
          >
            {t('footer.btnSign')}
          </button>
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
          isPending={isPending}
          signError={signError}
          onClose={() => setShowSignModal(false)}
          onSign={handleSign}
        />
      )}
    </div>
  )
}

// ── Sign Modal (canvas drawing pad) ──────────────────────────────────

function SignModal({
  itrNumber,
  itrSignatures,
  criticalBlocked,
  isPending,
  signError,
  onClose,
  onSign,
}: {
  itrNumber: string
  itrSignatures: Signature[]
  criticalBlocked: Item[]
  isPending: boolean
  signError: string | null
  onClose: () => void
  onSign: (role: 'executor' | 'supervisor' | 'client', signatureImage: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const [signRole, setSignRole] = useState<'executor' | 'supervisor' | 'client'>(() => {
    const roles = ['executor', 'supervisor', 'client'] as const
    return roles.find(r => !itrSignatures.some(s => s.role === r)) ?? 'executor'
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Init canvas stroke style
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#0f172a'
  }, [])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    setHasDrawn(true)
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pt = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPoint.current = pt
  }

  function onPointerUp() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const blocked = signRole === 'executor' && criticalBlocked.length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{t('signModal.title')}</h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px' }}>{itrNumber}</p>

        {/* Role selector */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>{t('signModal.signAs')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['executor', 'supervisor', 'client'] as const).map(role => {
              const alreadySigned = itrSignatures.some(s => s.role === role)
              return (
                <button
                  key={role}
                  onClick={() => !alreadySigned && setSignRole(role)}
                  disabled={alreadySigned}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '2px solid', borderColor: signRole === role ? '#7c3aed' : '#e2e8f0', background: alreadySigned ? '#f8fafc' : signRole === role ? '#f5f3ff' : 'white', color: alreadySigned ? '#94a3b8' : signRole === role ? '#7c3aed' : '#374151', cursor: alreadySigned ? 'not-allowed' : 'pointer', textAlign: 'center' }}
                >
                  {alreadySigned ? '✓ ' : ''}{t(`roles.${role}` as Parameters<typeof t>[0])}
                </button>
              )
            })}
          </div>
        </div>

        {/* Canvas drawing pad */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{t('signModal.signatureLabel')}</label>
            <button onClick={clearCanvas} style={{ fontSize: '11px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              {t('signModal.clearCanvas')}
            </button>
          </div>
          <div style={{ position: 'relative', border: '1.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
            <canvas
              ref={canvasRef}
              width={392}
              height={160}
              style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {!hasDrawn && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{t('signModal.placeholder')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Critical blocker warning */}
        {blocked && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, fontWeight: 600 }}>
              {t('signModal.blockedMsg', { count: criticalBlocked.length })}
            </p>
          </div>
        )}

        {signError && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
            {signError}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
          >
            {t('signModal.cancel')}
          </button>
          <button
            onClick={() => onSign(signRole, canvasRef.current!.toDataURL('image/png'))}
            disabled={isPending || blocked || !hasDrawn}
            style={{ padding: '9px 20px', background: isPending || blocked || !hasDrawn ? '#ddd6fe' : '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending || blocked || !hasDrawn ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? t('signModal.signing') : t('signModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Photo Upload ──────────────────────────────────────────────────────

function PhotoUpload({
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
            <div key={att.id} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              {att.signed_url
                ? <img src={att.signed_url} alt={t('upload.photoAlt')} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => setLightbox(att.signed_url)} />
                : <div style={{ width: '100%', height: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📷</div>
              }
              {canEdit && (
                <button
                  onClick={() => handleDelete(att)}
                  style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
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
          <img src={lightbox} alt={t('upload.photoFullAlt')} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

// ── Create Punch Modal ────────────────────────────────────────────────

function CreatePunchModal({
  itrId,
  itrItemId: _itrItemId,
  projectId,
  tagId,
  initialDescription,
  onClose,
  onCreated,
}: {
  itrId: string
  itrItemId: string | null
  projectId: string
  tagId: string
  initialDescription: string
  onClose: () => void
  onCreated: () => void
}) {
  const t = useTranslations('ItrExecution')
  const CATEGORY_CONFIG = {
    A: { label: t('punchModal.catA'), color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
    B: { label: t('punchModal.catB'), color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
    C: { label: t('punchModal.catC'), color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  } as const

  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [targetDate, setTargetDate] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!description.trim()) { setError(t('punchModal.errorRequired')); return }
    setError(null)
    startTransition(async () => {
      const res = await createPunch({
        projectId,
        tagId,
        itrId,
        category,
        description: description.trim(),
        targetDate: targetDate || null,
      })
      if (res.error) { setError(res.error); return }
      onCreated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{t('punchModal.title')}</h2>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px' }}>{t('punchModal.subtitle')}</p>

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>{t('punchModal.labelCategory')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(cat => {
              const cfg = CATEGORY_CONFIG[cat]
              const active = category === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: `2px solid ${active ? cfg.color : '#e2e8f0'}`, background: active ? cfg.bg : 'white', color: active ? cfg.color : '#64748b', cursor: 'pointer', textAlign: 'center' }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelDescription')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('punchModal.descPlaceholder')}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Target date */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelTargetDate')}</label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
          >
            {t('punchModal.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{ padding: '9px 20px', background: isPending ? '#fed7aa' : '#ea580c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'default' : 'pointer' }}
          >
            {isPending ? t('punchModal.registering') : t('punchModal.register')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item Row ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  response,
  canEdit,
  onSave,
  onAddPunch,
  itrId,
  projectId,
  tagId,
  itemAttachments,
  onAttachmentAdded,
  onAttachmentRemoved,
}: {
  item: Item
  response: Response | null
  canEdit: boolean
  onSave: (itemId: string, data: {
    valueText?: string | null
    valueNumeric?: number | null
    valueBool?: boolean | null
    valueOption?: string | null
    remarks?: string | null
    isPassed?: boolean | null
  }) => void
  onAddPunch: (itemDesc: string, itemId: string) => void
  itrId: string
  projectId: string
  tagId: string
  itemAttachments: Attachment[]
  onAttachmentAdded: (att: Attachment) => void
  onAttachmentRemoved: (attId: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const isPassed = response?.is_passed

  return (
    <div style={{ background: 'white', border: `1px solid ${isPassed === false ? '#fecaca' : '#e2e8f0'}`, borderRadius: '10px', padding: '14px 16px' }}>

      {/* Item header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: item.item_type === 'checkbox' || item.item_type === 'yes_no' ? '0' : '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.item_number && (
              <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: '#94a3b8', minWidth: '28px' }}>{item.item_number}</span>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              {item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title={t('item.titleCritical')} />}
              {item.is_required && !item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title={t('item.titleRequired')} />}
              {item.requires_photo && <span style={{ fontSize: '10px', color: '#3b82f6' }} title={t('item.titlePhoto')}>⊙</span>}
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#0f172a', margin: '2px 0 0', lineHeight: '1.4' }}>{item.description}</p>
          {item.description_es && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0' }}>{item.description_es}</p>
          )}
        </div>

        {/* Add punch button */}
        <button
          onClick={() => onAddPunch(item.description, item.id)}
          title={t('item.punchTooltip')}
          style={{ flexShrink: 0, padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', cursor: 'pointer', marginTop: '2px' }}
        >
          ⚑
        </button>

        {/* Inline input for checkbox / yes_no */}
        {item.item_type === 'checkbox' && (
          <input
            type="checkbox"
            checked={response?.value_bool ?? false}
            disabled={!canEdit}
            onChange={e => onSave(item.id, {
              valueBool: e.target.checked,
              isPassed: item.is_critical ? e.target.checked : null,
            })}
            style={{ width: '20px', height: '20px', cursor: canEdit ? 'pointer' : 'default', marginTop: '2px', flexShrink: 0 }}
          />
        )}

        {item.item_type === 'yes_no' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                disabled={!canEdit}
                onClick={() => onSave(item.id, {
                  valueBool: val,
                  isPassed: item.is_critical ? val : null,
                })}
                style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: '1.5px solid', borderColor: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : '#e2e8f0', background: response?.value_bool === val ? (val ? '#ecfdf5' : '#fee2e2') : 'white', color: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : '#64748b', cursor: canEdit ? 'pointer' : 'default' }}
              >
                {val ? t('item.yesBtn') : t('item.noBtn')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text input */}
      {item.item_type === 'text' && (
        <textarea
          rows={2}
          defaultValue={response?.value_text ?? ''}
          disabled={!canEdit}
          placeholder={t('item.observationsPlaceholder')}
          onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}

      {/* Number input */}
      {item.item_type === 'number' && (
        <input
          type="number"
          defaultValue={response?.value_numeric ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueNumeric: e.target.value !== '' ? Number(e.target.value) : null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', width: '160px' }}
        />
      )}

      {/* Measurement input */}
      {item.item_type === 'measurement' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              step="0.001"
              defaultValue={response?.value_numeric ?? ''}
              disabled={!canEdit}
              onBlur={e => {
                const val = e.target.value !== '' ? Number(e.target.value) : null
                const passed = val !== null ? computeIsPassed(val, item.acceptance_min, item.acceptance_max) : null
                onSave(item.id, { valueNumeric: val, isPassed: passed })
              }}
              style={{ padding: '8px 10px', border: `1px solid ${isPassed === false ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '7px', fontSize: '13px', width: '140px' }}
            />
            {item.unit && <span style={{ fontSize: '12px', color: '#64748b' }}>{item.unit}</span>}
          </div>
          {(item.acceptance_min !== null || item.acceptance_max !== null) && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {item.acceptance_min !== null && item.acceptance_max !== null
                ? t('item.criterionBoth', { min: item.acceptance_min, max: item.acceptance_max, unit: item.unit ?? '' })
                : item.acceptance_min !== null
                ? t('item.criterionMin', { min: item.acceptance_min, unit: item.unit ?? '' })
                : t('item.criterionMax', { max: item.acceptance_max!, unit: item.unit ?? '' })}
            </span>
          )}
          {isPassed === true && <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>{t('item.passed')}</span>}
          {isPassed === false && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>{t('item.failed')}</span>}
        </div>
      )}

      {/* Select */}
      {item.item_type === 'select' && (
        <select
          value={response?.value_option ?? ''}
          disabled={!canEdit}
          onChange={e => onSave(item.id, { valueOption: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', background: 'white', fontFamily: 'inherit', minWidth: '200px' }}
        >
          <option value="">{t('item.selectPlaceholder')}</option>
          {(item.options ?? (item.acceptance_text ? item.acceptance_text.split(',').map(s => s.trim()) : [])).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {/* Date */}
      {item.item_type === 'date' && (
        <input
          type="date"
          defaultValue={response?.value_text ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px' }}
        />
      )}

      {/* Photo upload */}
      {(item.item_type === 'photo' || item.requires_photo) && (
        <PhotoUpload
          itrId={itrId}
          itemId={item.id}
          projectId={projectId}
          tagId={tagId}
          existingAttachments={itemAttachments}
          canEdit={canEdit}
          onAdded={onAttachmentAdded}
          onRemoved={onAttachmentRemoved}
        />
      )}

      {/* Remarks (for measurement + critical items) */}
      {(item.is_critical || item.item_type === 'measurement') && (
        <div style={{ marginTop: '8px' }}>
          <textarea
            rows={1}
            defaultValue={response?.remarks ?? ''}
            disabled={!canEdit}
            placeholder={t('item.remarksPlaceholder')}
            onBlur={e => {
              onSave(item.id, {
                valueBool: response?.value_bool ?? null,
                valueNumeric: response?.value_numeric ?? null,
                valueText: response?.value_text ?? null,
                valueOption: response?.value_option ?? null,
                isPassed: response?.is_passed ?? null,
                remarks: e.target.value || null,
              })
            }}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', color: '#64748b' }}
          />
        </div>
      )}
    </div>
  )
}
