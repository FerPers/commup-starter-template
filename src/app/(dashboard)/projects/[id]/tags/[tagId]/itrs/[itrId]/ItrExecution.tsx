'use client'

import { PersonName, useAskDialog, useToast } from '@/components/ui'
import { ownershipOf } from '@/lib/sync/ownership'
import { isInactiveMember } from '@/lib/people/inactive'
// Pantalla de ejecución de ITR — orquestador (Q2). El estado de autosave vive
// en useItrAutosave; los bloques de UI (ItemRow, PhotoUpload, SignModal,
// RevokeModal, CreatePunchModal, MicAppend) son componentes hermanos.

import { useState, useEffect, useMemo, useTransition, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { revokeItrApproval } from '@/app/actions/itr-instances'
import { uploadOrQueuePhoto, pendingAttachment, pendingSignature, signOrQueue } from '@/lib/sync/outbox'
import { evaluateItrCompletion } from '@/lib/itr/completion'
import { parseSourceRows } from '@/lib/itr/table'
import { localItrStatus } from '@/lib/sync/outbox-utils'
import { itemDescription } from '@/lib/itr/item-text'
import { nextPendingItemId } from '@/lib/itr/next-pending'
import { getOutbox, OUTBOX_CHANGED_EVENT, SYNC_DONE_EVENT, type OutboxEntry } from '@/lib/offline-queue'
import { discardOutboxEntry } from '@/lib/sync/replay'
import { downloadCaptures } from '@/lib/sync/export-captures-client'
import { useItrAutosave } from './useItrAutosave'
import ItemRow from './ItemRow'
import SignModal from './SignModal'
import RevokeModal from './RevokeModal'
import CreatePunchModal from './CreatePunchModal'
import TestEquipmentSection, { type EquipmentOption, type EquipmentUsed } from './TestEquipmentSection'
import { availableSigningRoles, type Attachment, type ItrData, type Signature } from './types'
import { allRequiredSigned, itrSignErrorKey, normalizeRequired, type SigningRole } from '@/lib/itr/signatures'
import ReturnToExecutor from './ReturnToExecutor'
import AssignmentsPanel, { type AssignableMember } from './AssignmentsPanel'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { applyTheme, currentTheme, THEME_EVENT } from '@/lib/theme/client'
import type { Theme } from '@/types/theme'
import { ink, alpha } from '@/lib/theme'
import { formatInZone } from '@/lib/time/zone'

export default function ItrExecution({
  itr,
  projectId,
  tagId,
  currentUserId,
  currentUserRole,
  canEdit,
  attachments: initialAttachments = [],
  memberIds: memberIdList = [],
  testEquipment,
  documentsSlot,
  conflictsSlot,
  assignable,
  punchAssignees = [],
  timezone,
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
  /** Fase 4-B: equipos de prueba usados e inventario activo de la org. */
  testEquipment?: { requires: boolean; used: EquipmentUsed[]; options: EquipmentOption[] }
  /** Fase 8: documentos referenciados (bloquea la firma con una revisión superada). */
  documentsSlot?: React.ReactNode
  /** S18: respuestas sin red en conflicto (ResponseConflicts, armado en la página). */
  conflictsSlot?: React.ReactNode
  /** S04 (C-01): miembros para completar o cambiar asignaciones de roles sin firmar (solo editores). */
  assignable?: AssignableMember[]
  /** S06 (C-22): miembros a los que se puede asignar un punch desde el ITR. */
  punchAssignees?: Array<{ user_id: string; full_name: string }>
  /** Zona del proyecto: la hora de cada firma se muestra en ella y rotulada (el servidor corre en UTC). */
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('ItrExecution')
  /** Nombre del usuario actual según su asignación en este ITR (para pintar firmas pendientes). */
  const executorName = itr.itr_assignments.find(a => a.user_id === currentUserId)?.profiles?.full_name ?? null
  const locale = useLocale()
  const [isModalPending, startModalTransition] = useTransition()
  // G-08: diálogo propio
  const { dialog, confirm } = useAskDialog()
  const toast = useToast()
  // C-36 (S04): el idioma guardado se lee en un efecto; leerlo al inicializar desajustaba la hidratación.
  const [itemLang, setItemLangState] = useState<'es' | 'en'>(locale.startsWith('es') ? 'es' : 'en')
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('commup-itr-item-lang')
      if (stored === 'es' || stored === 'en') setItemLangState(stored)
    } catch { /* almacenamiento bloqueado: queda el idioma de la app */ }
  }, [])
  const setItemLang = (lang: 'es' | 'en') => {
    setItemLangState(lang)
    try { window.localStorage.setItem('commup-itr-item-lang', lang) } catch { /* sin almacenamiento */ }
  }
  const [showSignModal, setShowSignModal] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [showPunchModal, setShowPunchModal] = useState(false)
  const [punchItemDesc, setPunchItemDesc] = useState('')
  const [punchItrItemId, setPunchItrItemId] = useState<string | null>(null)

  // ── Autosave + responses optimistas + offline ───────────────────────
  const { responses, saveResponse, lastSaved, saveError, isPending, isOffline, pendingCount, syncing, itrStatus } =
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
  /**
   * S06 (I-02) + A01: punch y fotos que el servidor rechazó; quedan aquí hasta reintentarse bien o descartarse a
   * mano (con constancia en sync_conflicts), nunca se pierden en silencio.
   */
  const [unsynced, setUnsynced] = useState<Array<OutboxEntry & { id: number; lastError: string }>>([])
  const [justSigned, setJustSigned] = useState<Signature[]>([])
  useEffect(() => {
    setJustSigned(previous => previous.filter(local => !itr.itr_signatures.some(saved => saved.role === local.role)))
  }, [itr.itr_signatures])
  useEffect(() => {
    let urls: string[] = []
    const load = () => {
      getOutbox().then(entries => {
        urls.forEach(u => URL.revokeObjectURL(u))
        // S18: solo lo capturado por quien está en sesión (lo demás queda retenido en el banner del shell).
        const own = entries.filter(e => e.itrId === itr.id && ownershipOf(e, currentUserId) === 'mine')
        const photos = own
          .filter((e): e is typeof e & { kind: 'photo' } => e.kind === 'photo')
          .map(e => pendingAttachment(e))
        urls = photos.map(a => a.signed_url).filter((u): u is string => Boolean(u))
        setPendingPhotos(photos)
        setPendingSignatures(own
          .filter((e): e is typeof e & { kind: 'signature' } => e.kind === 'signature')
          .map(e => pendingSignature(e, currentUserId, executorName)))
        setUnsynced(own.filter((e): e is OutboxEntry & { id: number; lastError: string } =>
          (e.kind === 'punch' || e.kind === 'photo') && !!e.lastError && e.id !== undefined))
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
  const st = ITR_STATUS_COLORS[itrStatus] ?? ITR_STATUS_COLORS.not_started

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
  const sourceRows = parseSourceRows(itr.source_rows)
  const completion = evaluateItrCompletion(allItems, Object.values(responses), Object.values(attachmentMap).flat(), sourceRows)
  const visibleIds = new Set(completion.applicableItemIds)
  const visibleItems = allItems.filter(item => visibleIds.has(item.id))
  const criticalBlocked = visibleItems.filter(
    item => item.is_critical && responses[item.id]?.is_passed === false,
  )
  const executor = itr.itr_assignments.find(a => a.role === 'executor')
  const memberIds = useMemo(() => new Set(memberIdList), [memberIdList])
  // Sprint O: estado calculado en local (espejo del servidor) para poder firmar sin red
  // antes de que las respuestas encoladas lleguen al servidor.
  const localEvaluation = localItrStatus(allItems, responses, [...Object.values(serverAttachments).flat(), ...pendingPhotos], sourceRows)
  const localStatus = localEvaluation.status
  const effectiveProgress = itr.status === 'approved' ? itr.progress_pct : localEvaluation.pct
  const effectiveStatus = itr.status === 'approved' ? 'approved' : localStatus
  const requiredRoles = normalizeRequired(itr.required_signatures)
  const allowedSignRoles = availableSigningRoles(requiredRoles, itr.itr_assignments, effectiveSignatures, currentUserId)
  const canCapture = canEdit && effectiveSignatures.length === 0 && itr.status !== 'approved'
  const signingReady = effectiveStatus === 'completed' && allowedSignRoles.length > 0 && !isPending && !saveError && !generalUploading

  // ── Sign ────────────────────────────────────────────────────────────

  function handleSign(role: 'executor' | 'supervisor' | 'client', signatureImage: string) {
    if (!signingReady || !allowedSignRoles.includes(role)) return
    setSignError(null)
    startModalTransition(async () => {
      // Sprint O: sin red la firma se encola; al sincronizar viaja después de las respuestas.
      const res = await signOrQueue({ itrId: itr.id, role, projectId, tagId, signatureImage })
      if ('error' in res) { const key = itrSignErrorKey(res.error); setSignError(key ? t(`signErrors.${key}`) : res.error); return }
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

  const canRevoke = ROLE_TIERS.privileged.includes(currentUserRole) && (itr.status === 'approved' || itr.itr_signatures.length > 0)

  // ── Punch ────────────────────────────────────────────────────────────

  function openPunchModal(itemDesc: string, itemId: string | null = null) {
    setPunchItemDesc(itemDesc)
    setPunchItrItemId(itemId)
    setShowPunchModal(true)
  }

  // C-29: menú «⋯» del pie en el teléfono y salto al siguiente ítem obligatorio pendiente.
  const [moreOpen, setMoreOpen] = useState(false)
  // C-29: alto contraste a mano en el «⋯» (el inspector no sale del ITR para cambiarlo).
  const [theme, setThemeState] = useState<Theme>('light')
  useEffect(() => {
    setThemeState(currentTheme())
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])
  function toggleContrast() {
    setMoreOpen(false)
    void applyTheme(theme === 'contrast' ? 'light' : 'contrast')
  }
  function jumpToNextPending() {
    const id = nextPendingItemId(completion.missingRequiredItemIds, itemId => {
      const el = document.getElementById(`itr-item-${itemId}`)
      return el ? el.getBoundingClientRect().top : null
    })
    const el = id ? document.getElementById(`itr-item-${id}`) : null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.remove('is-flash')
    void el.offsetWidth  // reinicia la animación si se vuelve al mismo ítem
    el.classList.add('is-flash')
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '150px' }}>
      {dialog}

      {/* Back nav: vuelve a la pestaña ITRs del tag (N1b) */}
      <div style={{ padding: '16px 16px 0' }}>
        <Link href={`/projects/${projectId}/tags/${tagId}?tab=itrs`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block', padding: '6px 0' }}>
          ← {tag?.tag_number} / ITRs
        </Link>
      </div>

      {/* Header card */}
      <div style={{ margin: '12px 16px 0', background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', padding: '16px 18px' }}>
        {/* flexWrap: en el teléfono idioma y estado bajan a su propia línea en vez de apretar el título (S1). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px 12px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {phase && (
                <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: alpha(phase.color, 9), color: ink(phase.color) }}>
                  {phase.code}
                </span>
              )}
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                {itr.itr_number}
              </span>
            </div>
            {(itr.loops ?? itr.ce_causes) && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {itr.loops
                  ? t.rich('header.loopSource', { a: chunks => <Link href={`/projects/${projectId}/loops`} style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{chunks}</Link>, loop: itr.loops.loop_number })
                  : t.rich('header.causeSource', { a: chunks => <Link href={`/projects/${projectId}/ce-matrices/${itr.ce_causes!.ce_matrices?.id ?? ''}`} style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{chunks}</Link>, matrix: itr.ce_causes!.ce_matrices?.code ?? '', cause: itr.ce_causes!.code, description: itr.ce_causes!.description ?? '' })}
                {' '}· {t('header.sourceRows', { count: sourceRows?.length ?? 0 })}
              </div>
            )}
            {template && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{template.title}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: '999px', padding: '1px 6px' }}>
                  v{template.version}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div
              role="group"
              aria-label={t('header.itemLanguage')}
              style={{ display: 'inline-flex', padding: '2px', borderRadius: '8px', background: 'var(--gray-50)', border: '1px solid var(--border)' }}
            >
              {(['es', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setItemLang(l)}
                  aria-pressed={itemLang === l}
                  style={{
                    padding: '3px 9px',
                    fontSize: '12px',
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
                  title={t(l === 'es' ? 'header.itemsEs' : 'header.itemsEn')}
                >
                  {l}
                </button>
              ))}
            </div>
            <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: st.bg, color: ink(st.color), whiteSpace: 'nowrap' }}>
              {STATUS_LABELS[itrStatus] ?? itrStatus}
            </span>
          </div>
        </div>

        {/* Tag info row */}
        {tag && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: 'var(--text-body)' }}>{t('header.tagLabel')}</strong>{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', color: ink(tag.disciplines?.color ?? 'var(--gray-700)') }}>{tag.tag_number}</span>
              {' — '}{tag.description}
            </span>
            {executor?.profiles?.full_name && (
              <span><strong style={{ color: 'var(--text-body)' }}>{t('header.inspectorLabel')}</strong> <PersonName name={executor.profiles.full_name} inactive={isInactiveMember(executor.user_id, memberIds)} /></span>
            )}
            {itr.scheduled_date && (
              <span><strong style={{ color: 'var(--text-body)' }}>{t('header.dateLabel')}</strong> {itr.scheduled_date}</span>
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
              <summary style={{ cursor: 'pointer', color: 'var(--text-body)', fontWeight: 600 }}>{t('tagData.title', { count: present.length })}</summary>
              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '12px', rowGap: '4px', margin: '8px 0 0', padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                {present.map(([label, value]) => (
                  <Fragment key={label}>
                    <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                    <dd style={{ margin: 0, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{value}</dd>
                  </Fragment>
                ))}
              </dl>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>{t('tagData.hint')}</p>
            </details>
          )
        })()}

        {/* Progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>
            <span>{t('header.progress')}</span>
            <span>{effectiveProgress}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${effectiveProgress}%`, background: effectiveProgress >= 100 ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: '4px', transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Signatures status */}
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {requiredRoles.map(role => {
            const sig = effectiveSignatures.find(s => s.role === role)
            const assignee = itr.itr_assignments.find(a => a.role === role)
            return (
              <div key={role} style={{ borderRadius: '7px', background: sig?.pending ? 'var(--warning-50)' : sig ? 'var(--success-50)' : 'var(--gray-50)', border: `1px solid ${sig?.pending ? 'var(--warning-200)' : sig ? 'var(--success-200)' : 'var(--border)'}`, overflow: 'hidden', minWidth: '130px' }}>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: sig ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px' }}>{sig?.pending ? '⏳' : sig ? '✓' : '○'}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: sig?.pending ? 'var(--warning-700)' : sig ? 'var(--success-700)' : 'var(--text-muted)' }}>{t(`roles.${role}` as Parameters<typeof t>[0])}</span>
                  </div>
                  {sig && (
                    <>
                      <div style={{ fontSize: '12px', color: 'var(--text-body)', fontWeight: 500, marginLeft: '17px' }}>
                        <PersonName name={sig.profiles?.full_name} inactive={isInactiveMember(sig.user_id, memberIds)} />{sig.signer_company ? ` · ${sig.signer_company}` : ''}
                      </div>
                      <div style={{ fontSize: '12px', color: sig.pending ? 'var(--warning-700)' : 'var(--text-muted)', marginLeft: '17px', marginTop: '1px' }}>
                        {sig.pending ? t('sync.pending') : formatInZone(sig.signed_at, timezone, locale)}
                      </div>
                    </>
                  )}
                  {!sig && (
                    <div style={{ fontSize: '12px', color: assignee ? 'var(--text-muted)' : 'var(--warning-700)', marginLeft: '17px', marginTop: '2px' }}>
                      {assignee ? <PersonName name={assignee.profiles?.full_name} inactive={isInactiveMember(assignee.user_id, memberIds)} /> : t('assign.unassigned')}
                    </div>
                  )}
                </div>
                {sig?.signature_image && (
                  <div style={{ borderTop: '1px solid var(--success-200)', padding: '4px 6px', background: 'var(--success-50)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- base64 signature data URL, Image optimizer doesn't apply */}
                    <img src={sig.signature_image} alt={t(`roles.${role}` as Parameters<typeof t>[0])} style={{ height: '36px', maxWidth: '140px', objectFit: 'contain', display: 'block' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* S05 (C-23): quien firma después del ejecutor puede devolverle el ITR con observaciones */}
        {itr.status !== 'approved' && itr.itr_signatures.some(s => s.role === 'executor')
          && itr.itr_assignments.some(a => a.user_id === currentUserId && a.role !== 'executor' && requiredRoles.includes(a.role as SigningRole))
          && !itr.itr_signatures.some(s => s.user_id === currentUserId) && (
          <div style={{ marginTop: '12px' }}>
            <ReturnToExecutor itrId={itr.id} projectId={projectId} tagId={itr.tag_id} />
          </div>
        )}

        {/* Sprint O: punch o firma guardados sin red */}
        {queuedNotice && (
          <div role="status" style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--warning-50)', borderRadius: '8px', border: '1px solid var(--warning-200)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning-700)', margin: 0, flex: 1 }}>
              {queuedNotice === 'punch' ? `⚑ ${t('punchModal.queued')}` : `✍ ${t('sync.signatureQueued')}`}
            </p>
            <button onClick={() => setQueuedNotice(null)} aria-label={t('header.dismiss')} style={{ background: 'transparent', border: 'none', color: 'var(--warning-700)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* S06 (I-02) + A01: punch y fotos rechazados por el servidor — visibles hasta reintentar bien o descartar */}
        {unsynced.length > 0 && (
          <div role="alert" style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--danger-50)', borderRadius: '8px', border: '1px solid var(--danger-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '0 0 6px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--danger-700)', margin: 0 }}>⚠ {t('sync.unsyncedTitle')}</p>
              {/* A01: llevárselas (con fotos) antes de descartar; funciona sin red. */}
              <button type="button" title={t('sync.exportHint')} onClick={() => { downloadCaptures({ outbox: unsynced }, 'unsynced').catch(() => toast.error(t('sync.exportFailed'))) }}
                style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--danger-200)', background: 'var(--card-bg)', color: 'var(--danger-700)', cursor: 'pointer', flexShrink: 0 }}>
                ⤓ {t('sync.export')}
              </button>
            </div>
            {unsynced.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
                <p style={{ fontSize: '12px', color: 'var(--danger-900)', margin: 0, flex: 1, wordBreak: 'break-word' }}>
                  {u.kind === 'photo'
                    ? t('sync.unsyncedPhoto', { name: u.fileName, error: u.lastError })
                    : u.kind === 'punch' ? t('sync.unsyncedPunch', { desc: u.description.slice(0, 60), error: u.lastError }) : null}
                </p>
                <button onClick={async () => {
                  if (!await confirm({ message: u.kind === 'photo' ? t('sync.discardPhotoConfirm') : t('sync.discardConfirm'), confirmLabel: t('sync.discard'), danger: true })) return
                  if ('error' in await discardOutboxEntry(u)) toast.error(t('sync.discardNeedsNetwork'))
                }}
                  style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--danger-200)', background: 'var(--card-bg)', color: 'var(--danger-700)', cursor: 'pointer', flexShrink: 0 }}>
                  {t('sync.discard')}
                </button>
              </div>
            ))}
          </div>
        )}

        {conflictsSlot}

        {/* Critical blockers warning */}
        {criticalBlocked.length > 0 && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--danger-100)', borderRadius: '8px', border: '1px solid var(--danger-200)' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--danger-700)', margin: '0 0 4px' }}>
              {t('criticalBlocked', { count: criticalBlocked.length })}
            </p>
            {criticalBlocked.map(item => {
              const desc = itemDescription(item, itemLang)
              return (
                <p key={item.id} style={{ fontSize: '12px', color: 'var(--danger-900)', margin: '2px 0' }}>
                  • {item.item_number ? `${item.item_number} ` : ''}{desc}
                </p>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Asignaciones de firma (S04, C-01): solo editores y con el ITR sin aprobar ─────────── */}
      {assignable && itr.status !== 'approved' && (
        <div style={{ margin: '12px 16px 0' }}>
          <AssignmentsPanel
            itrId={itr.id}
            projectId={projectId}
            tagId={itr.tag_id}
            requiredRoles={requiredRoles}
            assignments={itr.itr_assignments}
            signedRoles={itr.itr_signatures.map(s => s.role)}
            members={assignable}
          />
        </div>
      )}

      {/* ── Sections + Items ─────────────────────────────────────────── */}
      <div style={{ padding: '0 clamp(10px, 3vw, 20px)' }}>
        {sections.map(section => (
          <div key={section.id} style={{ marginTop: '20px' }}>
            <div style={{ padding: '10px 16px', background: 'var(--gray-50)', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {section.title}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {section.itr_template_items.filter(item => visibleIds.has(item.id)).map(item => (
                <div key={item.id} id={`itr-item-${item.id}`} className="itr-item-anchor">
                <ItemRow
                  item={item}
                  response={responses[item.id] ?? null}
                  canEdit={canCapture}
                  onSave={saveResponse}
                  sourceRows={sourceRows}
                  onAddPunch={openPunchModal}
                  canPunch={canEdit}
                  itrId={itr.id}
                  projectId={projectId}
                  tagId={tagId}
                  itemAttachments={attachmentMap[item.id] ?? []}
                  onAttachmentAdded={att => addAttachment(item.id, att)}
                  onAttachmentRemoved={attId => removeAttachment(item.id, attId)}
                  lang={itemLang}
                />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Equipos de prueba (fase 4-B) — debajo de los ítems, junto a la firma que habilitan (S1) */}
      {testEquipment && (
        <div style={{ padding: '20px 20px 0' }}>
          <TestEquipmentSection
            itrId={itr.id}
            projectId={projectId}
            requires={testEquipment.requires}
            used={testEquipment.used}
            options={testEquipment.options}
            editable={canCapture && currentUserRole !== 'client'}
            canManageInventory={ROLE_TIERS.editor.includes(currentUserRole)}
          />
        </div>
      )}

      {/* ── Documentos referenciados (fase 8) — debajo de los ítems: en el teléfono no empujan el checklist (S1) */}
      {documentsSlot && <div style={{ padding: '20px 20px 0' }}>{documentsSlot}</div>}

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

      <div className="itr-footer" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card-bg)', borderTop: '1px solid var(--border)', padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 10px', zIndex: 100 }}>
        {/* Teléfono (backlog 4): la línea de estado solo ocupa lugar cuando importa (sin red, sincronizando, error) */}
        <div className={`itr-footer-status${isOffline || syncing || saveError ? ' is-alert' : ''}`} role="status" style={{ fontSize: '12px', color: isOffline ? 'var(--warning-700)' : syncing ? 'var(--primary-700)' : isPending ? 'var(--primary-700)' : lastSaved ? 'var(--success-700)' : 'var(--text-muted)' }}>
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
        <div className="itr-footer-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          {/* C-29: salta al siguiente ítem obligatorio sin llenar (circular) */}
          {canCapture && completion.missingRequiredItemIds.length > 0 && (
            <button
              onClick={jumpToNextPending}
              title={t('footer.nextPendingTitle')}
              aria-label={t('footer.nextPending', { count: completion.missingRequiredItemIds.length })}
              style={{ ...footerBtn, background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-700)' }}
            >
              ↓ <span className="desk-only">{t('footer.nextPending', { count: completion.missingRequiredItemIds.length })}</span>
              <span className="phone-only">{completion.missingRequiredItemIds.length}</span>
            </button>
          )}
          {canEdit && <button
            onClick={() => openPunchModal('')}
            style={{ ...footerBtn, background: 'var(--orange-50)', border: '1px solid var(--orange-200)', color: 'var(--orange-700)' }}
          >
            {t('footer.btnPunch')}
          </button>}
          {/* Con el ITR firmado o aprobado ya no se agregan fotos: el botón no se ofrece */}
          {(canCapture || generalUploading) && <button
            onClick={() => generalPhotoInputRef.current?.click()}
            disabled={!canCapture || generalUploading}
            title={generalUploadError ?? t('upload.addPhoto')}
            style={{ ...footerBtn, background: generalUploading ? 'var(--primary-50)' : 'var(--success-50)', border: `1px solid ${generalUploadError ? 'var(--danger-300)' : 'var(--success-200)'}`, color: generalUploading ? 'var(--primary-700)' : 'var(--success-700)', cursor: canCapture && !generalUploading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {generalUploading ? '⏳' : '📷'} {(attachmentMap['general'] ?? []).length > 0 ? t('footer.btnPhotos', { count: (attachmentMap['general'] ?? []).length }) : t('footer.btnPhoto')}
          </button>}
          {(() => {
            const allRolesPending = allRequiredSigned(requiredRoles, effectiveSignatures.map(s => s.role))
            const canSign = signingReady && !allRolesPending
            const signTooltip =
              effectiveStatus === 'approved' || allRolesPending ? t('footer.signTooltipApproved')
              : effectiveStatus === 'rejected' ? t('footer.signTooltipRejected')
              : effectiveStatus !== 'completed' ? t('footer.signTooltipIncomplete')
              : ''
            return (
              <button
                className="itr-footer-sign"
                onClick={() => setShowSignModal(true)}
                disabled={!canSign}
                title={signTooltip || undefined}
                style={{ ...footerBtn, padding: '10px 20px', background: !canSign ? 'var(--gray-50)' : 'var(--violet-600)', color: !canSign ? 'var(--text-muted)' : 'var(--card-bg)', border: 'none', cursor: !canSign ? 'not-allowed' : 'pointer' }}
              >
                {t('footer.btnSign')}
              </button>
            )
          })()}
          {/* En escritorio, PDF y revocar van en la barra; en el teléfono, en «⋯» (itr-footer-extra / itr-footer-more) */}
          {itr.status === 'approved' && (
            <a
              className="itr-footer-extra"
              href={`/projects/${projectId}/tags/${tagId}/itrs/${itr.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...footerBtn, background: 'var(--success-50)', border: '1px solid var(--success-200)', color: 'var(--success-700)', textDecoration: 'none', alignItems: 'center', gap: '5px' }}
            >
              ⬇ {t('footer.btnPdf')}
            </a>
          )}
          {canRevoke && (
            <button
              className="itr-footer-extra"
              onClick={() => { setRevokeError(null); setShowRevokeModal(true) }}
              style={{ ...footerBtn, background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)' }}
            >
              {t('footer.btnRevoke')}
            </button>
          )}
          <div className="itr-footer-more" style={{ position: 'relative' }}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              aria-label={t('footer.more')}
              style={{ ...footerBtn, minWidth: '44px', padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              ⋯
            </button>
            {moreOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', minWidth: '220px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {itr.status === 'approved' && (
                  <a role="menuitem" href={`/projects/${projectId}/tags/${tagId}/itrs/${itr.id}/pdf`} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)}
                    style={{ ...footerBtn, display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--success-700)', textDecoration: 'none' }}>
                    ⬇ {t('footer.btnPdf')}
                  </a>
                )}
                {canRevoke && (
                  <button role="menuitem" onClick={() => { setMoreOpen(false); setRevokeError(null); setShowRevokeModal(true) }}
                    style={{ ...footerBtn, textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--danger-700)' }}>
                    {t('footer.btnRevoke')}
                  </button>
                )}
                <button role="menuitemcheckbox" aria-checked={theme === 'contrast'} onClick={toggleContrast}
                  style={{ ...footerBtn, display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
                  <span aria-hidden="true">{theme === 'contrast' ? '☑' : '☐'}</span>
                  {t('footer.contrast')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Punch Modal ─────────────────────────────────────────────── */}
      {showPunchModal && (
        <CreatePunchModal
          itrId={itr.id}
          itrItemId={punchItrItemId}
          itemLabel={(() => {
            const item = punchItrItemId ? allItems.find(i => i.id === punchItrItemId) : null
            return item ? `${item.item_number ? `${item.item_number} ` : ''}${itemDescription(item, itemLang)}`.slice(0, 120) : null
          })()}
          assignees={punchAssignees}
          projectId={projectId}
          tagId={tagId}
          disciplineCode={tag?.disciplines?.code ?? null}
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
          requiredRoles={requiredRoles}
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

/** C-29: botones del pie con objetivo táctil de 44 px (con guantes, en campo). */
const footerBtn: React.CSSProperties = {
  minHeight: '44px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}
