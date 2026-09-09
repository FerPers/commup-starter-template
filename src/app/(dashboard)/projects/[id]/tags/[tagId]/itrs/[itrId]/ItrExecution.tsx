'use client'

import { PersonName } from '@/components/ui'
import { isInactiveMember } from '@/lib/people/inactive'
// Pantalla de ejecución de ITR — orquestador (Q2). El estado de autosave vive
// en useItrAutosave; los bloques de UI (ItemRow, PhotoUpload, SignModal,
// RevokeModal, CreatePunchModal, MicAppend) son componentes hermanos.

import { useState, useEffect, useMemo, useTransition, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { revokeItrApproval } from '@/app/actions/itr-instances'
import { uploadOrQueuePhoto, pendingAttachment, pendingSignature, signOrQueue } from '@/lib/sync/outbox'
import { evaluateItrCompletion } from '@/lib/itr/completion'
import { localItrStatus } from '@/lib/sync/outbox-utils'
import { getOutbox, OUTBOX_CHANGED_EVENT, SYNC_DONE_EVENT } from '@/lib/offline-queue'
import { useItrAutosave } from './useItrAutosave'
import ItemRow from './ItemRow'
import SignModal from './SignModal'
import RevokeModal from './RevokeModal'
import CreatePunchModal from './CreatePunchModal'
import { availableSigningRoles, type Attachment, type ItrData, type Signature } from './types'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'

export default function ItrExecution({
  itr,
  projectId,
  tagId,
  currentUserId,
  currentUserRole,
  canEdit,
  attachments: initialAttachments = [],
  memberIds: memberIdList = [],
}: {
  itr: ItrData
  projectId: string
  tagId: string
  currentUserId: string
  currentUserRole: string
  canEdit: boolean
  attachments?: Attachment[]
  /** Ids de miembros actuales de la org: nombres fuera del conjunto se marcan «(inactivo)». */
  memberIds?: string[]
}) {
  const router = useRouter()
  const t = useTranslations('ItrExecution')
  /** Nombre del usuario actual según su asignación en este ITR (para pintar firmas pendientes). */
  const executorName = itr.itr_assignments.find(a => a.user_id === currentUserId)?.profiles?.full_name ?? null
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

  // Attachments state — keyed by itemId or 'general'. Estado optimista de los
  // adjuntos del servidor, re-sincronizado con props tras router.refresh().
  const groupAttachments = (list: Attachment[]) => {
    const map: Record<string, Attachment[]> = {}
    for (const a of list) {
      const key = a.item_id ?? 'general'
      ;(map[key] ??= []).push(a)
    }
    return map
  }
  const [serverAttachments, setServerAttachments] = useState<Record<string, Attachment[]>>(() => groupAttachments(initialAttachments))
  useEffect(() => {
    setServerAttachments(groupAttachments(initialAttachments))
  }, [initialAttachments])

  /** Aviso «guardado sin red» (punch o firma). */
  const [queuedNotice, setQueuedNotice] = useState<'punch' | 'signature' | null>(null)

  // Sprint O: fotos y firmas de este ITR que siguen en la bandeja de salida (sin red).
  const [pendingPhotos, setPendingPhotos] = useState<Attachment[]>([])
  const [pendingSignatures, setPendingSignatures] = useState<Signature[]>([])
  const [justSigned, setJustSigned] = useState<Signature[]>([])
  useEffect(() => {
    setJustSigned(previous => previous.filter(local => !itr.itr_signatures.some(saved => saved.role === local.role)))
  }, [itr.itr_signatures])
  useEffect(() => {
    let urls: string[] = []
    const load = () => {
      getOutbox().then(entries => {
        urls.forEach(u => URL.revokeObjectURL(u))
        const own = entries.filter(e => e.itrId === itr.id)
        const photos = own
          .filter((e): e is typeof e & { kind: 'photo' } => e.kind === 'photo')
          .map(e => pendingAttachment(e))
        urls = photos.map(a => a.signed_url).filter((u): u is string => Boolean(u))
        setPendingPhotos(photos)
        setPendingSignatures(own
          .filter((e): e is typeof e & { kind: 'signature' } => e.kind === 'signature')
          .map(e => pendingSignature(e, currentUserId, executorName)))
      }).catch(() => {})
    }
    load()
    window.addEventListener(OUTBOX_CHANGED_EVENT, load)
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, load)
      urls.forEach(u => URL.revokeObjectURL(u))
    }
  }, [itr.id, currentUserId, executorName])

  /** Firmas del servidor + las pendientes de la bandeja (una por rol). */
  const effectiveSignatures = useMemo<Signature[]>(() => {
    const roles = new Set(itr.itr_signatures.map(s => s.role))
    return [...itr.itr_signatures, ...[...justSigned, ...pendingSignatures].filter(s => {
      if (roles.has(s.role)) return false
      roles.add(s.role)
      return true
    })]
  }, [itr.itr_signatures, pendingSignatures, justSigned])

  // Al terminar un replay con envíos, recargar del servidor (fotos y punches reales).
  const [syncedFlash, setSyncedFlash] = useState(false)
  useEffect(() => {
    const onSynced = () => { setSyncedFlash(true); setQueuedNotice(null); router.refresh() }
    window.addEventListener(SYNC_DONE_EVENT, onSynced)
    return () => window.removeEventListener(SYNC_DONE_EVENT, onSynced)
  }, [router])
  useEffect(() => {
    if (!syncedFlash) return
    const h = setTimeout(() => setSyncedFlash(false), 4000)
    return () => clearTimeout(h)
  }, [syncedFlash])

  const attachmentMap = useMemo(() => {
    const map: Record<string, Attachment[]> = { ...serverAttachments }
    for (const a of pendingPhotos) {
      const key = a.item_id ?? 'general'
      map[key] = [...(map[key] ?? []), a]
    }
    return map
  }, [serverAttachments, pendingPhotos])

  const addAttachment = useCallback((itemId: string | null, att: Attachment) => {
    const key = itemId ?? 'general'
    setServerAttachments(prev => ({ ...prev, [key]: [...(prev[key] ?? []), att] }))
  }, [])

  const removeAttachment = useCallback((itemId: string | null, attachmentId: string) => {
    const key = itemId ?? 'general'
    setServerAttachments(prev => ({ ...prev, [key]: (prev[key] ?? []).filter(a => a.id !== attachmentId) }))
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
  const completion = evaluateItrCompletion(allItems, Object.values(responses), Object.values(attachmentMap).flat())
  const visibleIds = new Set(completion.applicableItemIds)
  const visibleItems = allItems.filter(item => visibleIds.has(item.id))
  const criticalBlocked = visibleItems.filter(
    item => item.is_critical && responses[item.id]?.is_passed === false,
  )
  const executor = itr.itr_assignments.find(a => a.role === 'executor')
  const memberIds = useMemo(() => new Set(memberIdList), [memberIdList])
  // Sprint O: estado calculado en local (espejo del servidor) para poder firmar sin red
  // antes de que las respuestas encoladas lleguen al servidor.
  const localEvaluation = localItrStatus(allItems, responses, [...Object.values(serverAttachments).flat(), ...pendingPhotos])
  const localStatus = localEvaluation.status
  const effectiveProgress = itr.status === 'approved' ? itr.progress_pct : localEvaluation.pct
  const effectiveStatus = itr.status === 'approved' ? 'approved' : localStatus
  const allowedSignRoles = availableSigningRoles(itr.itr_assignments, effectiveSignatures, currentUserId)
  const canCapture = canEdit && effectiveSignatures.length === 0 && itr.status !== 'approved'
  const signingReady = effectiveStatus === 'completed' && allowedSignRoles.length > 0 && !isPending && !saveError && !generalUploading

  // ── Sign ────────────────────────────────────────────────────────────

  function handleSign(role: 'executor' | 'supervisor' | 'client', signatureImage: string) {
    if (!signingReady || !allowedSignRoles.includes(role)) return
    setSignError(null)
    startModalTransition(async () => {
      // Sprint O: sin red la firma se encola; al sincronizar viaja después de las respuestas.
      const res = await signOrQueue({ itrId: itr.id, role, projectId, tagId, signatureImage })
      if ('error' in res) { setSignError(res.error); return }
      setShowSignModal(false)
      if (res.queued) setQueuedNotice('signature')
      else {
        setJustSigned(previous => [...previous, { id: `confirmed:${role}`, role, user_id: currentUserId, signed_at: new Date().toISOString(), signature_image: signatureImage, profiles: { full_name: executorName ?? '' } }])
        router.refresh()
      }
    })
  }

  // ── Revoke approval ─────────────────────────────────────────────────

  function handleRevoke(reason: string) {
    setRevokeError(null)
    startModalTransition(async () => {
      const res = await revokeItrApproval({ itrId: itr.id, projectId, tagId, reason })
      if (res.error) { setRevokeError(res.error); return }
      setShowRevokeModal(false)
      setJustSigned([])
      router.refresh()
    })
  }

  const canRevoke = ['owner', 'admin', 'architect'].includes(currentUserRole) && (itr.status === 'approved' || itr.itr_signatures.length > 0)

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
              <span><strong style={{ color: 'var(--gray-700)' }}>{t('header.inspectorLabel')}</strong> <PersonName name={executor.profiles.full_name} inactive={isInactiveMember(executor.user_id, memberIds)} /></span>
            )}
            {itr.scheduled_date && (
              <span><strong style={{ color: 'var(--gray-700)' }}>{t('header.dateLabel')}</strong> {itr.scheduled_date}</span>
            )}
          </div>
        )}

        {/* Datos maestros del tag (solo lectura): fabricante, modelo, serie, rango, hoja de datos, P&ID.
            Se muestran desde la ingeniería cargada para contrastar en campo; no se duplican como ítems. */}
        {tag && (() => {
          const range = tag.range_min !== null && tag.range_min !== undefined && tag.range_max !== null && tag.range_max !== undefined
            ? `${tag.range_min} – ${tag.range_max}${tag.eng_unit ? ` ${tag.eng_unit}` : ''}`
            : tag.eng_unit ?? null
          const rows: Array<[string, string | null | undefined]> = [
            [t('tagData.manufacturer'), tag.manufacturer],
            [t('tagData.model'), tag.model],
            [t('tagData.serial'), tag.serial_number],
            [t('tagData.range'), range],
            [t('tagData.datasheet'), tag.datasheet_number ? `${tag.datasheet_number}${tag.revision ? ` rev. ${tag.revision}` : ''}` : null],
            [t('tagData.pid'), tag.pid_drawing],
            [t('tagData.junctionBox'), tag.junction_box],
          ]
          const present = rows.filter(([, value]) => typeof value === 'string' && value.trim().length > 0) as Array<[string, string]>
          if (present.length === 0) return null
          return (
            <details style={{ marginTop: '10px', fontSize: '12px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--gray-700)', fontWeight: 600 }}>{t('tagData.title', { count: present.length })}</summary>
              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '12px', rowGap: '4px', margin: '8px 0 0', padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                {present.map(([label, value]) => (
                  <Fragment key={label}>
                    <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                    <dd style={{ margin: 0, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{value}</dd>
                  </Fragment>
                ))}
              </dl>
              <p style={{ margin: '6px 0 0', color: 'var(--gray-400)', fontSize: '11px' }}>{t('tagData.hint')}</p>
            </details>
          )
        })()}

        {/* Progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--gray-400)', marginBottom: '5px' }}>
            <span>{t('header.progress')}</span>
            <span>{effectiveProgress}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${effectiveProgress}%`, background: effectiveProgress >= 100 ? '#10b981' : '#3b82f6', borderRadius: '4px', transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Signatures status */}
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['executor', 'supervisor', 'client'] as const).map(role => {
            const sig = effectiveSignatures.find(s => s.role === role)
            const signedDate = sig ? sig.signed_at.slice(0, 10).split('-').reverse().join('/') : null
            const signedTime = sig ? sig.signed_at.slice(11, 16) : null
            return (
              <div key={role} style={{ borderRadius: '7px', background: sig?.pending ? '#fffbeb' : sig ? '#ecfdf5' : 'var(--gray-50)', border: `1px solid ${sig?.pending ? '#fde68a' : sig ? '#a7f3d0' : 'var(--border)'}`, overflow: 'hidden', minWidth: '130px' }}>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: sig ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px' }}>{sig?.pending ? '⏳' : sig ? '✓' : '○'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: sig?.pending ? '#b45309' : sig ? '#10b981' : 'var(--gray-400)' }}>{t(`roles.${role}` as Parameters<typeof t>[0])}</span>
                  </div>
                  {sig && (
                    <>
                      <div style={{ fontSize: '11px', color: 'var(--gray-700)', fontWeight: 500, marginLeft: '17px' }}>
                        <PersonName name={sig.profiles?.full_name} inactive={isInactiveMember(sig.user_id, memberIds)} />
                      </div>
                      <div style={{ fontSize: '10px', color: sig.pending ? '#b45309' : 'var(--gray-400)', marginLeft: '17px', marginTop: '1px' }}>
                        {sig.pending ? t('sync.pending') : `${signedDate} ${signedTime}`}
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

        {/* Sprint O: punch o firma guardados sin red */}
        {queuedNotice && (
          <div role="status" style={{ marginTop: '12px', padding: '10px 14px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#b45309', margin: 0, flex: 1 }}>
              {queuedNotice === 'punch' ? `⚑ ${t('punchModal.queued')}` : `✍ ${t('sync.signatureQueued')}`}
            </p>
            <button onClick={() => setQueuedNotice(null)} aria-label="×" style={{ background: 'transparent', border: 'none', color: '#b45309', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
          </div>
        )}

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
              {section.itr_template_items.filter(item => visibleIds.has(item.id)).map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  response={responses[item.id] ?? null}
                  canEdit={canCapture}
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
          if (!file || !canCapture) return
          e.target.value = ''
          setGeneralUploading(true)
          setGeneralUploadError(null)
          // Sprint O: sin red queda en la bandeja de salida; la miniatura pendiente llega por el evento.
          const res = await uploadOrQueuePhoto({ itrId: itr.id, itemId: null, projectId, tagId, fileName: file.name, fileType: file.type, blob: file })
          setGeneralUploading(false)
          if ('error' in res) { setGeneralUploadError(res.error); return }
          if (!res.queued) addAttachment(null, res.attachment)
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
            : syncedFlash
            ? t('footer.synced')
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
            disabled={!canCapture || generalUploading}
            title={generalUploadError ?? t('upload.addPhoto')}
            style={{ padding: '9px 16px', background: generalUploading ? '#eff6ff' : '#f0fdf4', border: `1px solid ${generalUploadError ? '#fca5a5' : '#bbf7d0'}`, borderRadius: '8px', fontSize: '13px', color: generalUploading ? '#3b82f6' : '#15803d', cursor: canCapture && !generalUploading ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {generalUploading ? '⏳' : '📷'} {(attachmentMap['general'] ?? []).length > 0 ? t('footer.btnPhotos', { count: (attachmentMap['general'] ?? []).length }) : t('footer.btnPhoto')}
          </button>
          {(() => {
            const allRolesPending = (['executor', 'supervisor', 'client'] as const).every(r => effectiveSignatures.some(s => s.role === r))
            const canSign = signingReady && !allRolesPending
            const signTooltip =
              effectiveStatus === 'approved' || allRolesPending ? t('footer.signTooltipApproved')
              : effectiveStatus === 'rejected' ? t('footer.signTooltipRejected')
              : effectiveStatus !== 'completed' ? t('footer.signTooltipIncomplete')
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
          onCreated={({ queued }) => { setShowPunchModal(false); if (queued) setQueuedNotice('punch'); else router.refresh() }}
        />
      )}

      {/* ── Sign Modal ──────────────────────────────────────────────── */}
      {showSignModal && (
        <SignModal
          itrNumber={itr.itr_number}
          itrSignatures={effectiveSignatures}
          allowedRoles={allowedSignRoles}
          ready={signingReady}
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
