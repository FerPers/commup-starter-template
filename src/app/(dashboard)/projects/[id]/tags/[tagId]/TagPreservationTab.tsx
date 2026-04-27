'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignPreservationPlan, updatePlanStatus } from '@/app/actions/preservation'

// ── Types ──────────────────────────────────────────────────────

export type PreservationProcedureOption = {
  id: string
  code: string
  title: string
  frequency: string
  interval_days: number
  disciplines: { code: string; color: string } | null
}

export type PreservationPlanRow = {
  id: string
  status: string
  start_date: string
  next_due_date: string
  last_performed_date: string | null
  responsible_user_id: string | null
  preservation_procedures: {
    id: string
    code: string
    title: string
    frequency: string
    interval_days: number
    disciplines: { code: string; color: string } | null
  } | null
  profiles: { full_name: string } | null
}

export type OrgMemberOption = {
  user_id: string
  role: string
  profiles: { full_name: string } | null
}

interface Props {
  tagId: string
  projectId: string
  plans: PreservationPlanRow[]
  procedures: PreservationProcedureOption[]
  orgMembers: OrgMemberOption[]
  canEdit: boolean
}

// ── Helpers ────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', quarterly: 'Trimestral',
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Activo',     color: '#16a34a', bg: '#f0fdf4' },
  suspended: { label: 'Suspendido', color: '#d97706', bg: '#fffbeb' },
  completed: { label: 'Completado', color: 'var(--text-muted)', bg: 'var(--gray-50)' },
}

function dueBadge(nextDue: string): { label: string; color: string; bg: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0)  return { label: `Vencido ${Math.abs(diffDays)}d`,  color: '#dc2626', bg: '#fef2f2' }
  if (diffDays === 0) return { label: 'Vence hoy',                        color: '#dc2626', bg: '#fef2f2' }
  if (diffDays <= 7)  return { label: `Vence en ${diffDays}d`,            color: '#d97706', bg: '#fffbeb' }
  return { label: `Próximo: ${nextDue}`,                                   color: '#16a34a', bg: '#f0fdf4' }
}

const DEFAULT_FORM = { procedureId: '', startDate: '', responsibleUserId: '' }

export default function TagPreservationTab({ tagId, projectId, plans, procedures, orgMembers, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAssign() {
    if (!form.procedureId || !form.startDate) {
      setFormError('Procedimiento y fecha de inicio son requeridos')
      return
    }
    setFormError(null)
    startTransition(async () => {
      const result = await assignPreservationPlan({
        tagId,
        projectId,
        procedureId: form.procedureId,
        startDate: form.startDate,
        responsibleUserId: form.responsibleUserId || undefined,
      })
      if (result.error) { setFormError(result.error); return }
      setShowModal(false)
      setForm(DEFAULT_FORM)
      router.refresh()
    })
  }

  async function handleStatusChange(planId: string, newStatus: 'active' | 'suspended' | 'completed') {
    startTransition(async () => {
      const result = await updatePlanStatus(planId, newStatus, projectId, tagId)
      if (result.error) alert(result.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)' }}>
            Planes de Preservación
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {plans.filter(p => p.status === 'active').length} activos
          </div>
        </div>
        {canEdit && procedures.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '7px 16px', borderRadius: '8px', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}
          >
            + Asignar plan
          </button>
        )}
        {canEdit && procedures.length === 0 && (
          <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
            Crea procedimientos en <a href="/admin/templates/preservation" style={{ color: '#3b82f6' }}>Admin › Templates</a>
          </span>
        )}
      </div>

      {/* Plans list */}
      {plans.length === 0 ? (
        <div style={{
          background: 'var(--gray-50)', border: '2px dashed #e2e8f0', borderRadius: '10px',
          padding: '36px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>◉</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px' }}>
            Sin planes de preservación
          </div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>
            Asigna un procedimiento para activar las rutinas de preservación de este equipo
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {plans.map(plan => {
            const proc = plan.preservation_procedures
            const due = dueBadge(plan.next_due_date)
            const st = STATUS_CFG[plan.status] ?? STATUS_CFG.active
            return (
              <div
                key={plan.id}
                style={{
                  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>
                        {proc?.code} — {proc?.title}
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {proc?.disciplines && (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: proc.disciplines.color + '20', color: proc.disciplines.color }}>
                          {proc.disciplines.code}
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {FREQ_LABELS[proc?.frequency ?? ''] ?? proc?.frequency} · cada {proc?.interval_days}d
                      </span>
                      {plan.profiles && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Responsable: {plan.profiles.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: due.bg, color: due.color, marginBottom: '4px' }}>
                      {due.label}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                      Inicio: {plan.start_date}
                    </div>
                    {plan.last_performed_date && (
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                        Último: {plan.last_performed_date}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                  <button
                    onClick={() => router.push(`/projects/${projectId}/tags/${tagId}/preservation/${plan.id}`)}
                    style={{ padding: '6px 14px', borderRadius: '7px', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                  >
                    Ejecutar
                  </button>
                  {canEdit && plan.status === 'active' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'suspended')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: '#fffbeb', color: '#d97706', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      Suspender
                    </button>
                  )}
                  {canEdit && plan.status === 'suspended' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'active')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: '#f0fdf4', color: '#16a34a', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      Reactivar
                    </button>
                  )}
                  {canEdit && plan.status !== 'completed' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'completed')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--gray-50)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      Completar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Assign Plan modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>Asignar plan de preservación</h2>
              <button onClick={() => { setShowModal(false); setFormError(null); setForm(DEFAULT_FORM) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--gray-400)' }}>✕</button>
            </div>

            {formError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '9px 13px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>Procedimiento *</label>
                <select
                  value={form.procedureId}
                  onChange={e => setForm(f => ({ ...f, procedureId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">— Seleccionar procedimiento —</option>
                  {procedures.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title} ({FREQ_LABELS[p.frequency] ?? p.frequency}, {p.interval_days}d)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                  Fecha de inicio (recepción del equipo) *
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px' }}>
                  Determina el ciclo: primer vencimiento = inicio + intervalo días
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>Responsable (opcional)</label>
                <select
                  value={form.responsibleUserId}
                  onChange={e => setForm(f => ({ ...f, responsibleUserId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">— Sin asignar —</option>
                  {orgMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name ?? m.user_id} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px' }}>
              <button
                onClick={() => { setShowModal(false); setFormError(null); setForm(DEFAULT_FORM) }}
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--gray-100)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={isPending}
                style={{ padding: '8px 18px', borderRadius: '8px', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending ? 'Asignando...' : 'Asignar plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
