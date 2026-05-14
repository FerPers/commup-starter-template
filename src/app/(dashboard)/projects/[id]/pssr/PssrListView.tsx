'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { createPssrReview } from '@/app/actions/pssr'

interface System { id: string; code: string; name: string }
interface Review {
  id: string
  review_number: string
  title: string
  status: string
  system_id: string
  created_at: string
  approved_at: string | null
  rfsu_certificate_id: string | null
  systems: { code: string; name: string } | null
}
interface Template { id: string; name: string }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:             { label: 'Borrador',          color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress:       { label: 'En progreso',        color: '#3b82f6', bg: '#eff6ff' },
  pending_approval:  { label: 'Pend. aprobación',   color: '#f59e0b', bg: '#fffbeb' },
  approved:          { label: 'Aprobado',            color: '#10b981', bg: '#ecfdf5' },
  rejected:          { label: 'Rechazado',           color: '#ef4444', bg: '#fee2e2' },
}

export default function PssrListView({
  projectId, systems, reviews, templates, canEdit,
}: {
  projectId: string
  systems: System[]
  reviews: Review[]
  templates: Template[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ systemId: '', templateId: templates[0]?.id ?? '', title: '', reviewDueDate: '' })
  const [formError, setFormError] = useState<string | null>(null)

  // Group reviews by system
  const reviewsBySystem = new Map<string, Review[]>()
  for (const r of reviews) {
    if (!reviewsBySystem.has(r.system_id)) reviewsBySystem.set(r.system_id, [])
    reviewsBySystem.get(r.system_id)!.push(r)
  }

  async function handleCreate() {
    if (!form.systemId) { setFormError('Selecciona un sistema'); return }
    if (!form.templateId) { setFormError('Selecciona un template'); return }
    setFormError(null)
    startTransition(async () => {
      try {
        const review = await createPssrReview({
          projectId,
          systemId: form.systemId,
          templateId: form.templateId,
          title: form.title || undefined,
          reviewDueDate: form.reviewDueDate || null,
        })
        setShowModal(false)
        router.push(`/projects/${projectId}/pssr/${review.id}`)
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : 'Error al crear')
      }
    })
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
    padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #d1d5db', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-strong)', background: 'var(--card-bg)',
  }

  return (
    <>
      {/* Header actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {canEdit && templates.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: 'var(--warning-500)', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            Iniciar PSSR
          </button>
        )}
        {canEdit && templates.length === 0 && (
          <a href="/admin/templates/pssr" style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--warning-50)', color: 'var(--warning-700)', textDecoration: 'none',
            border: '1px solid var(--warning-500)',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}>
            <AlertTriangle size={14} aria-hidden="true" />
            Configura un template PSSR primero
          </a>
        )}
      </div>

      {/* No reviews at all */}
      {reviews.length === 0 && (
        <div style={{
          ...cardStyle, textAlign: 'center', padding: '56px 32px',
          border: '1.5px dashed var(--gray-300)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <ShieldCheck size={40} color="var(--warning-500)" aria-hidden="true" />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 6px' }}>
            Sin revisiones PSSR
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Inicia una revisión cuando el sistema tenga el certificado RFC emitido y esté listo para arrancar.
          </p>
        </div>
      )}

      {/* Systems with reviews */}
      {Array.from(reviewsBySystem.entries()).map(([systemId, sysReviews]) => {
        const system = systems.find(s => s.id === systemId)
        return (
          <div key={systemId} style={{ ...cardStyle, marginBottom: '12px' }}>
            {/* System header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                background: 'var(--gray-100)', color: 'var(--text-muted)', letterSpacing: '0.05em',
              }}>
                {system?.code ?? '—'}
              </span>
              <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-strong)' }}>
                {system?.name ?? 'Sistema'}
              </span>
            </div>

            {/* Reviews list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sysReviews.map(review => {
                const cfg = STATUS_CFG[review.status] ?? STATUS_CFG.draft
                return (
                  <div
                    key={review.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px', borderRadius: '8px',
                      background: 'var(--gray-50)', border: '1px solid #f1f5f9',
                      cursor: 'pointer',
                    }}
                    onClick={() => router.push(`/projects/${projectId}/pssr/${review.id}`)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-strong)' }}>
                          {review.review_number}
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                          background: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                        {review.rfsu_certificate_id && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                            background: '#ecfdf5', color: '#10b981',
                          }}>
                            ✓ RFSU emitido
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {new Date(review.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {review.approved_at && ` · Aprobado ${new Date(review.approved_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                      </div>
                    </div>
                    <span style={{ color: '#cbd5e1', fontSize: '18px' }}>›</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Systems without reviews (only show if can edit) */}
      {canEdit && templates.length > 0 && systems.filter(s => !reviewsBySystem.has(s.id)).length > 0 && (
        <div style={{ ...cardStyle, border: '1.5px dashed #e2e8f0' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Sistemas sin PSSR
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {systems.filter(s => !reviewsBySystem.has(s.id)).map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setForm(f => ({ ...f, systemId: s.id }))
                  setShowModal(true)
                }}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                }}
              >
                <span style={{ fontFamily: 'monospace' }}>{s.code}</span> {s.name} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '32px',
            width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 20px' }}>
              Iniciar PSSR
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  Sistema *
                </label>
                <select
                  value={form.systemId}
                  onChange={e => setForm(f => ({ ...f, systemId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">— Seleccionar sistema —</option>
                  {systems.map(s => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
              {templates.length > 1 && (
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                    Template
                  </label>
                  <select
                    value={form.templateId}
                    onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}
                    style={inputStyle}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  Título (opcional)
                </label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Pre-Startup Safety Review"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  Fecha objetivo (opcional)
                </label>
                <input
                  type="date"
                  value={form.reviewDueDate}
                  onChange={e => setForm(f => ({ ...f, reviewDueDate: e.target.value }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Si se establece y el PSSR no se completa, se notificará al equipo cuando esté vencido.
                </p>
              </div>
              {formError && <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{formError}</p>}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--gray-100)', border: 'none', cursor: 'pointer', color: 'var(--gray-700)',
                }}>
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={isPending} style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#f59e0b', color: 'white', border: 'none',
                  cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                }}>
                  {isPending ? 'Iniciando...' : 'Iniciar revisión'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}