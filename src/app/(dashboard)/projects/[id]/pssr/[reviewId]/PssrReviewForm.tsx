'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  updatePssrReviewItem,
  updatePssrReviewNotes,
  submitPssrForApproval,
  addPssrSignature,
  removePssrSignature,
  approvePssrAndIssueRfsu,
  rejectPssrReview,
} from '@/app/actions/pssr'

// ── Types ──────────────────────────────────────────────────────────

type ItemStatus = 'pending' | 'si' | 'no' | 'na'
type ReviewStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'

interface ReviewItem {
  id: string
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  status: ItemStatus
  responsible: string | null
  actions: string | null
  completion_date: string | null
}

interface Signature {
  id: string
  user_id: string
  discipline: string | null
  signature_data: string
  signed_at: string
  profiles: { full_name: string; id: string } | null
}

interface Props {
  projectId: string
  review: {
    id: string
    review_number: string
    title: string
    status: ReviewStatus
    notes: string | null
    rfsu_certificate_id: string | null
    systems: { id: string; code: string; name: string } | null
    approved_at: string | null
  }
  items: ReviewItem[]
  signatures: Signature[]
  project: { id: string; name: string; code: string }
  currentUserId: string
  currentUserName: string
  canApprove: boolean
  totalItems: number
}

// ── Config ─────────────────────────────────────────────────────────

const STATUS_CFG: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Borrador',         color: '#64748b', bg: '#f1f5f9' },
  in_progress:      { label: 'En progreso',       color: '#3b82f6', bg: '#eff6ff' },
  pending_approval: { label: 'Pend. aprobación',  color: '#f59e0b', bg: '#fffbeb' },
  approved:         { label: 'Aprobado ✓',        color: '#10b981', bg: '#ecfdf5' },
  rejected:         { label: 'Rechazado',          color: '#ef4444', bg: '#fee2e2' },
}

const CAT_COLORS: Record<string, string> = {
  'Ingeniería y Diseño': '#3b82f6',
  'Documentación': '#8b5cf6',
  'Mecánica y Tuberías': '#f59e0b',
  'Electricidad': '#ef4444',
  'Instrumentación y Control': '#06b6d4',
  'Seguridad de Procesos': '#f97316',
  'Seguridad / HSE': '#10b981',
  'Operaciones y Capacitación': '#6366f1',
  'Mantenimiento': '#64748b',
  'Medio Ambiente': '#22c55e',
  'Construcción y Comisionamiento': '#d97706',
}
function catColor(cat: string) { return CAT_COLORS[cat] ?? '#64748b' }

// ── Main Component ─────────────────────────────────────────────────

export default function PssrReviewForm({
  projectId, review, items: initialItems, signatures: initialSigs,
  project, currentUserId, currentUserName, canApprove,
  totalItems,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState(initialItems)
  const [sigs, setSigs] = useState(initialSigs)
  const [notes, setNotes] = useState(review.notes ?? '')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [showSignModal, setShowSignModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const readonly = review.status === 'approved'

  // Group items by category preserving order
  const grouped: [string, ReviewItem[]][] = []
  const catOrder: string[] = []
  for (const item of items) {
    if (!catOrder.includes(item.category)) catOrder.push(item.category)
  }
  for (const cat of catOrder) {
    grouped.push([cat, items.filter(i => i.category === cat)])
  }

  // Computed progress from local state
  const localResolved = items.filter(i => i.status === 'si' || i.status === 'na').length
  const localPct = totalItems > 0 ? Math.round((localResolved / totalItems) * 100) : 0
  const localAllResolved = totalItems > 0 && localResolved === totalItems

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function toggleItem(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  async function handleStatusChange(item: ReviewItem, status: ItemStatus) {
    if (readonly) return
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i))
    startTransition(async () => {
      try {
        await updatePssrReviewItem({ itemId: item.id, reviewId: review.id, projectId, status })
      } catch {
        // Revert
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
      }
    })
  }

  async function handleFieldSave(item: ReviewItem, field: 'responsible' | 'actions' | 'completion_date', value: string) {
    if (readonly) return
    startTransition(async () => {
      await updatePssrReviewItem({
        itemId: item.id, reviewId: review.id, projectId,
        [field === 'responsible' ? 'responsible' : field === 'actions' ? 'actions' : 'completionDate']: value || null,
      })
    })
  }

  async function handleSaveNotes() {
    startTransition(async () => {
      await updatePssrReviewNotes(review.id, projectId, notes)
    })
  }

  async function handleSubmitForApproval() {
    setActionError(null)
    startTransition(async () => {
      try {
        await submitPssrForApproval(review.id, projectId)
        router.refresh()
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  async function handleApprove() {
    setActionError(null)
    if (sigs.length === 0) {
      setActionError('Se requiere al menos una firma antes de aprobar')
      return
    }
    startTransition(async () => {
      try {
        const cert = await approvePssrAndIssueRfsu(review.id, projectId)
        setActionSuccess(`PSSR aprobado. Certificado RFSU ${cert.certificate_number} emitido.`)
        router.refresh()
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  async function handleReject() {
    if (!confirm('¿Rechazar este PSSR? El equipo deberá corregir los ítems y re-enviarlo.')) return
    startTransition(async () => {
      try {
        await rejectPssrReview(review.id, projectId)
        router.refresh()
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  async function handleRemoveSig(sigId: string) {
    startTransition(async () => {
      await removePssrSignature(sigId, review.id, projectId)
      setSigs(prev => prev.filter(s => s.id !== sigId))
    })
  }

  const statusCfg = STATUS_CFG[review.status]
  const system = review.systems

  return (
    <>
      {/* Back + Header ───────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}/pssr`} style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          ← PSSR · {project.name}
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {review.review_number}
              </h1>
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: statusCfg.bg, color: statusCfg.color,
              }}>
                {statusCfg.label}
              </span>
              {system && (
                <span style={{
                  padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  background: '#f1f5f9', color: '#475569',
                }}>
                  {system.code} — {system.name}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>{review.title}</p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {review.status === 'approved' && review.rfsu_certificate_id && (
              <a
                href={`/projects/${projectId}/certificates/${review.rfsu_certificate_id}`}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46',
                  textDecoration: 'none',
                }}
              >
                Ver certificado RFSU →
              </a>
            )}
            {(review.status === 'draft' || review.status === 'in_progress' || review.status === 'rejected') && !readonly && localAllResolved && (
              <button
                onClick={handleSubmitForApproval}
                disabled={isPending}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#f59e0b', color: 'white', border: 'none',
                  cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                }}
              >
                Enviar para aprobación
              </button>
            )}
            {review.status === 'pending_approval' && canApprove && (
              <>
                <button
                  onClick={handleReject}
                  disabled={isPending}
                  style={{
                    padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Rechazar
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isPending || sigs.length === 0}
                  title={sigs.length === 0 ? 'Se requiere al menos una firma' : undefined}
                  style={{
                    padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: sigs.length === 0 ? '#d1fae5' : '#10b981', color: 'white', border: 'none',
                    cursor: isPending || sigs.length === 0 ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                  }}
                >
                  ✓ Aprobar + Emitir RFSU
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar ────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
        padding: '16px 24px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>PROGRESO</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: localPct === 100 ? '#10b981' : '#0f172a' }}>
              {localResolved}/{totalItems} ítems
            </span>
          </div>
          <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: localPct === 100 ? '#10b981' : '#f59e0b',
              width: `${localPct}%`, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
        <span style={{
          fontSize: '20px', fontWeight: 800,
          color: localPct === 100 ? '#10b981' : '#f59e0b', minWidth: '48px', textAlign: 'right',
        }}>
          {localPct}%
        </span>
      </div>

      {/* Action error/success ────────────────────────────────── */}
      {actionError && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', background: '#fef2f2',
          border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px', fontWeight: 500,
          marginBottom: '16px',
        }}>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5',
          border: '1px solid #a7f3d0', color: '#065f46', fontSize: '13px', fontWeight: 500,
          marginBottom: '16px',
        }}>
          {actionSuccess}
        </div>
      )}

      {/* Checklist items ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        {grouped.map(([category, catItems]) => {
          const catResolved = catItems.filter(i => i.status === 'si' || i.status === 'na').length
          const catDone = catResolved === catItems.length
          const isExpanded = !expandedCats.has(category) // open by default

          return (
            <div key={category} style={{
              background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
              overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {/* Category header — click to collapse */}
              <button
                onClick={() => toggleCat(category)}
                style={{
                  width: '100%', textAlign: 'left', background: '#f8fafc', border: 'none', cursor: 'pointer',
                  padding: '14px 20px', borderLeft: `4px solid ${catColor(category)}`,
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}
              >
                <span style={{
                  display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                  background: catDone ? '#10b981' : catColor(category), flexShrink: 0,
                }} />
                <span style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                  {category}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {catResolved}/{catItems.length}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '14px', marginLeft: '4px' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>

              {/* Items */}
              {isExpanded && catItems.map(item => {
                const isItemExpanded = expandedItems.has(item.id)
                const statusColors = {
                  pending: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
                  si:      { bg: '#ecfdf5', color: '#10b981', border: '#a7f3d0' },
                  no:      { bg: '#fee2e2', color: '#ef4444', border: '#fecaca' },
                  na:      { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
                }
                const sc = statusColors[item.status]

                return (
                  <div key={item.id} style={{
                    borderTop: '1px solid #f1f5f9',
                    borderLeft: `4px solid ${sc.border}`,
                    background: item.status === 'si' ? '#fafffe' : item.status === 'no' ? '#fffafa' : 'white',
                  }}>
                    {/* Item row */}
                    <div style={{ padding: '14px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      {/* Order */}
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1', paddingTop: '2px', flexShrink: 0, minWidth: '22px' }}>
                        {item.item_order}
                      </span>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#374151', marginBottom: '3px' }}>
                          {item.element}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                          {item.requirement}
                        </div>
                        {item.notes_hint && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                            💡 {item.notes_hint}
                          </div>
                        )}

                        {/* Expand details toggle */}
                        {(item.status === 'si' || item.status === 'no') && (
                          <button
                            onClick={() => toggleItem(item.id)}
                            style={{
                              background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer',
                              fontSize: '11px', color: '#3b82f6', fontWeight: 600,
                            }}
                          >
                            {isItemExpanded ? '▾ Ocultar detalles' : '▸ Responsable / Acciones'}
                          </button>
                        )}

                        {/* Detail fields */}
                        {isItemExpanded && !readonly && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input
                              defaultValue={item.responsible ?? ''}
                              onBlur={e => handleFieldSave(item, 'responsible', e.target.value)}
                              placeholder="Responsable asignado"
                              style={{
                                width: '100%', padding: '7px 10px', borderRadius: '6px',
                                border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none',
                                boxSizing: 'border-box', fontFamily: 'inherit',
                              }}
                            />
                            <textarea
                              defaultValue={item.actions ?? ''}
                              onBlur={e => handleFieldSave(item, 'actions', e.target.value)}
                              placeholder="Acciones requeridas / comentarios"
                              rows={2}
                              style={{
                                width: '100%', padding: '7px 10px', borderRadius: '6px',
                                border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none',
                                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                              }}
                            />
                            <input
                              type="date"
                              defaultValue={item.completion_date ?? ''}
                              onBlur={e => handleFieldSave(item, 'completion_date', e.target.value)}
                              style={{
                                width: '160px', padding: '7px 10px', borderRadius: '6px',
                                border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                        )}
                        {/* Read-only details */}
                        {(readonly || !isItemExpanded) && (item.responsible || item.actions) && item.status !== 'pending' && (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                            {item.responsible && <span>👤 {item.responsible}</span>}
                            {item.responsible && item.actions && <span> · </span>}
                            {item.actions && <span>{item.actions}</span>}
                            {item.completion_date && <span> · {item.completion_date}</span>}
                          </div>
                        )}
                      </div>

                      {/* Status buttons */}
                      {!readonly && (
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          {(['si', 'no', 'na'] as ItemStatus[]).map(s => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(item, item.status === s ? 'pending' : s)}
                              style={{
                                padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                border: '1.5px solid',
                                borderColor: item.status === s ? sc.border : '#e2e8f0',
                                background: item.status === s ? sc.bg : 'white',
                                color: item.status === s ? sc.color : '#94a3b8',
                                cursor: 'pointer', transition: 'all 0.1s',
                                textTransform: 'uppercase',
                              }}
                            >
                              {s === 'si' ? 'Sí' : s === 'no' ? 'No' : 'N/A'}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Read-only status */}
                      {readonly && (
                        <span style={{
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                          background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                          flexShrink: 0, textTransform: 'uppercase',
                        }}>
                          {item.status === 'si' ? 'Sí' : item.status === 'no' ? 'No' : item.status === 'na' ? 'N/A' : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Notes ───────────────────────────────────────────────── */}
      {!readonly && (
        <div style={{
          background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
          padding: '20px 24px', marginBottom: '20px',
        }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>
            Observaciones generales
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            rows={3}
            placeholder="Notas, condiciones especiales, observaciones del equipo..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#0f172a',
            }}
          />
        </div>
      )}

      {/* Signatures ──────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
        padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Firmas de aprobación
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Los líderes responsables firman para certificar el cumplimiento
            </p>
          </div>
          {!readonly && review.status !== 'draft' && (
            <button
              onClick={() => setShowSignModal(true)}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer',
              }}
            >
              ✍ Firmar
            </button>
          )}
        </div>

        {sigs.length === 0 ? (
          <div style={{
            padding: '28px', textAlign: 'center', background: '#f8fafc',
            borderRadius: '8px', border: '1.5px dashed #e2e8f0',
          }}>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              {review.status === 'draft'
                ? 'Completa todos los ítems antes de agregar firmas'
                : 'Sin firmas aún — los responsables deben firmar antes de aprobar'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {sigs.map(sig => (
              <div key={sig.id} style={{
                border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px',
                background: '#fafafa',
              }}>
                <img
                  src={sig.signature_data}
                  alt="Firma"
                  style={{ width: '100%', height: '80px', objectFit: 'contain', background: 'white', borderRadius: '6px', border: '1px solid #f1f5f9' }}
                />
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                    {sig.profiles?.full_name ?? 'Usuario'}
                  </div>
                  {sig.discipline && (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{sig.discipline}</div>
                  )}
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    {new Date(sig.signed_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!readonly && sig.user_id === currentUserId && (
                  <button
                    onClick={() => handleRemoveSig(sig.id)}
                    style={{
                      marginTop: '6px', padding: '3px 8px', borderRadius: '5px', fontSize: '10px',
                      background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer',
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign Modal ──────────────────────────────────────────── */}
      {showSignModal && (
        <SignModal
          reviewId={review.id}
          projectId={projectId}
          currentUserName={currentUserName}
          onSigned={(sig) => { setSigs(prev => [...prev, sig]); setShowSignModal(false) }}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </>
  )
}

// ── Sign Modal ─────────────────────────────────────────────────────

function SignModal({
  reviewId, projectId, currentUserName, onSigned, onClose,
}: {
  reviewId: string
  projectId: string
  currentUserName: string
  onSigned: (sig: any) => void
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [discipline, setDiscipline] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
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
    setIsDrawing(true); setHasDrawn(true)
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2); ctx.fill()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pt = getPoint(e)
    ctx.beginPath(); ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y); ctx.stroke()
    lastPoint.current = pt
  }

  function clearCanvas() {
    canvasRef.current!.getContext('2d')!.clearRect(0, 0, 392, 160)
    setHasDrawn(false)
  }

  function handleSign() {
    const signatureData = canvasRef.current!.toDataURL('image/png')
    startTransition(async () => {
      await addPssrSignature({ reviewId, projectId, discipline, signatureData })
      onSigned({
        id: crypto.randomUUID(),
        user_id: '', discipline, signature_data: signatureData,
        signed_at: new Date().toISOString(),
        profiles: { full_name: currentUserName, id: '' },
      })
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>
          Firma de aprobación
        </h3>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
            Disciplina / Rol
          </label>
          <input
            value={discipline}
            onChange={e => setDiscipline(e.target.value)}
            placeholder="Process Engineer, HSE Lead, Operations Manager..."
            list="pssr-disciplines"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: '8px',
              border: '1.5px solid #d1d5db', fontSize: '13px', outline: 'none',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <datalist id="pssr-disciplines">
            {['Process Engineer','HSE Lead','Operations Manager','Maintenance Lead',
              'Commissioning Lead','Electrical Engineer','Instrument Engineer',
              'Mechanical Engineer','Project Manager','QAQC Lead'].map(d => <option key={d} value={d} />)}
          </datalist>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Firma</label>
          <button onClick={clearCanvas} style={{ background: 'none', border: 'none', fontSize: '12px', color: '#94a3b8', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>
        <div style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fafafa', marginBottom: '20px' }}>
          <canvas
            ref={canvasRef}
            width={432}
            height={160}
            style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setIsDrawing(false)}
            onPointerLeave={() => setIsDrawing(false)}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#374151',
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSign}
            disabled={isPending || !hasDrawn}
            style={{
              padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: isPending || !hasDrawn ? '#ddd6fe' : '#7c3aed', color: 'white', border: 'none',
              cursor: isPending || !hasDrawn ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Guardando...' : 'Confirmar firma'}
          </button>
        </div>
      </div>
    </div>
  )
}