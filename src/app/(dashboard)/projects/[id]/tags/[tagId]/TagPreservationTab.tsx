'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { assignPreservationPlan, updatePlanStatus } from '@/app/actions/preservation'
import { DialogSurface, useToast } from '@/components/ui'
import { alpha, ink } from '@/lib/theme'

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

const FREQ_KEYS = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly'] as const
const PLAN_STATUS_KEYS = ['active', 'suspended', 'completed'] as const

const STATUS_CFG: Record<(typeof PLAN_STATUS_KEYS)[number], { color: string; bg: string }> = {
  active:    { color: 'var(--success-700)', bg: 'var(--success-50)' },
  suspended: { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
  completed: { color: 'var(--text-muted)',  bg: 'var(--gray-50)' },
}

type Tx = (key: 'overdue' | 'dueToday' | 'dueIn' | 'next', values?: { n?: number; date?: string }) => string

function dueBadge(nextDue: string, tx: Tx): { label: string; color: string; bg: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0)  return { label: tx('overdue', { n: Math.abs(diffDays) }),  color: 'var(--danger-700)', bg: 'var(--danger-50)' }
  if (diffDays === 0) return { label: tx('dueToday'),                           color: 'var(--danger-700)', bg: 'var(--danger-50)' }
  if (diffDays <= 7)  return { label: tx('dueIn', { n: diffDays }),             color: 'var(--warning-700)', bg: 'var(--warning-50)' }
  return { label: tx('next', { date: nextDue }),                                 color: 'var(--success-700)', bg: 'var(--success-50)' }
}

const DEFAULT_FORM = { procedureId: '', startDate: '', responsibleUserId: '' }

export default function TagPreservationTab({ tagId, projectId, plans, procedures, orgMembers, canEdit }: Props) {
  const tx = useTranslations('TagPreservation')
  const tp = useTranslations('Preservation')
  const tr = useTranslations('Users')
  const freqLabel = (f: string | undefined) =>
    f && (FREQ_KEYS as readonly string[]).includes(f) ? tp(`freq.${f as (typeof FREQ_KEYS)[number]}`) : f
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const toast = useToast()
  const modalTitleId = useId()
  const closeModal = () => { setShowModal(false); setFormError(null); setForm(DEFAULT_FORM) }

  async function handleAssign() {
    if (!form.procedureId || !form.startDate) {
      setFormError(tx('errRequired'))
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
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)' }}>
            {tx('title')}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {tx('activeCount', { count: plans.filter(p => p.status === 'active').length })}
          </div>
        </div>
        {canEdit && procedures.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '7px 16px', borderRadius: '8px', background: 'var(--primary-600)', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}
          >
            {tx('assignPlanBtn')}
          </button>
        )}
        {canEdit && procedures.length === 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {tx.rich('createProcedures', {
              link: c => <Link href="/admin/templates/preservation" style={{ color: 'var(--primary-700)' }}>{c}</Link>,
            })}
          </span>
        )}
      </div>

      {/* Plans list */}
      {plans.length === 0 ? (
        <div style={{
          background: 'var(--gray-50)', border: '2px dashed var(--gray-200)', borderRadius: '10px',
          padding: '36px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>◉</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-body)', marginBottom: '6px' }}>
            {tx('emptyTitle')}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {tx('emptyHint')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {plans.map(plan => {
            const proc = plan.preservation_procedures
            const due = dueBadge(plan.next_due_date, tx)
            const statusKey = (PLAN_STATUS_KEYS as readonly string[]).includes(plan.status) ? (plan.status as (typeof PLAN_STATUS_KEYS)[number]) : 'active'
            const st = STATUS_CFG[statusKey]
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
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: st.bg, color: ink(st.color) }}>
                        {tp(`planStatus.${statusKey}`)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {proc?.disciplines && (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: alpha(proc.disciplines.color, 13), color: ink(proc.disciplines.color) }}>
                          {proc.disciplines.code}
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {freqLabel(proc?.frequency)} · {tx('everyDays', { n: proc?.interval_days ?? 0 })}
                      </span>
                      {plan.profiles && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {tx('responsible', { name: plan.profiles.full_name })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: due.bg, color: ink(due.color), marginBottom: '4px' }}>
                      {due.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {tx('start', { date: plan.start_date })}
                    </div>
                    {plan.last_performed_date && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {tx('last', { date: plan.last_performed_date })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--gray-100)', paddingTop: '10px' }}>
                  <button
                    onClick={() => router.push(`/projects/${projectId}/tags/${tagId}/preservation/${plan.id}`)}
                    style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--primary-600)', color: '#fff', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                  >
                    {tx('execute')}
                  </button>
                  {canEdit && plan.status === 'active' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'suspended')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--warning-50)', color: 'var(--warning-700)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      {tx('suspend')}
                    </button>
                  )}
                  {canEdit && plan.status === 'suspended' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'active')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--success-50)', color: 'var(--success-700)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      {tx('reactivate')}
                    </button>
                  )}
                  {canEdit && plan.status !== 'completed' && (
                    <button
                      onClick={() => handleStatusChange(plan.id, 'completed')}
                      disabled={isPending}
                      style={{ padding: '6px 14px', borderRadius: '7px', background: 'var(--gray-50)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: 'none' }}
                    >
                      {tx('complete')}
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
          <DialogSurface onClose={closeModal} labelledBy={modalTitleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 id={modalTitleId} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{tx('modalTitle')}</h2>
              <button onClick={closeModal} aria-label={tx('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {formError && (
              <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)', padding: '9px 13px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor={`${modalTitleId}-procedure`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '5px' }}>{tx('fieldProcedure')}</label>
                <select
                  id={`${modalTitleId}-procedure`}
                  value={form.procedureId}
                  onChange={e => setForm(f => ({ ...f, procedureId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">{tx('selectProcedure')}</option>
                  {procedures.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title} ({freqLabel(p.frequency)}, {p.interval_days}d)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${modalTitleId}-start`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '5px' }}>
                  {tx('fieldStartDate')}
                </label>
                <input
                  id={`${modalTitleId}-start`}
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {tx('startDateHint')}
                </div>
              </div>

              <div>
                <label htmlFor={`${modalTitleId}-responsible`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '5px' }}>{tx('fieldResponsible')}</label>
                <select
                  id={`${modalTitleId}-responsible`}
                  value={form.responsibleUserId}
                  onChange={e => setForm(f => ({ ...f, responsibleUserId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">{tx('unassigned')}</option>
                  {orgMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name ?? m.user_id} ({tr.has(`roles.${m.role}`) ? tr(`roles.${m.role}`) : m.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px' }}>
              <button
                onClick={closeModal}
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--gray-100)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}
              >
                {tx('cancel')}
              </button>
              <button
                onClick={handleAssign}
                disabled={isPending}
                style={{ padding: '8px 18px', borderRadius: '8px', background: 'var(--primary-600)', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending ? tx('assigning') : tx('assignPlan')}
              </button>
            </div>
          </DialogSurface>
        </div>
      )}
    </div>
  )
}
