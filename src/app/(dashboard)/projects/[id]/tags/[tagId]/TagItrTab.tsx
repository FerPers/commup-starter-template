'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createItrAssignment, deleteItr } from '@/app/actions/itr-instances'
import { detectTagType, sortTemplatesByRelevance } from '@/lib/tag-types'
import AddToWorkPlanModal, { type ModalItr } from '@/components/AddToWorkPlanModal'
import type { TagItr, ItrTemplate, OrgMember } from './TagDetail'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'

// ── Status config ────────────────────────────────────────────────────

const ITR_STATUS_LABELS: Record<string, string> = {
  not_started: 'Sin iniciar',
  in_progress: 'En progreso',
  completed:   'Completado',
  approved:    'Aprobado',
  rejected:    'Rechazado',
}

const SIGN_LABELS: Record<string, string> = {
  executor: 'Ejec',
  supervisor: 'Sup',
  client: 'Cli',
}

// ── Props ────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  tagId: string
  tagNumber: string
  subsystemId: string
  tagItrs: TagItr[]
  templates: ItrTemplate[]
  orgMembers: OrgMember[]
  canEdit: boolean
}

// ── Component ────────────────────────────────────────────────────────

export default function TagItrTab({
  projectId,
  tagId,
  tagNumber,
  subsystemId,
  tagItrs,
  templates,
  orgMembers,
  canEdit,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showAssign, setShowAssign] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Assignment form state
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedInspector, setSelectedInspector] = useState('')
  const [selectedSupervisor, setSelectedSupervisor] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')

  // Add to plan modal state
  const [planModalItr, setPlanModalItr] = useState<ModalItr | null>(null)
  const planModalMembers = orgMembers.map(m => ({
    user_id: m.user_id,
    full_name: m.profiles?.full_name ?? m.user_id,
  }))

  // Tag type detection for ITR recommendations
  const tagType = detectTagType(tagNumber)
  const sortedTemplates = sortTemplatesByRelevance(templates, tagType)
  const recommended = sortedTemplates.filter(t => t.recommended)
  const others       = sortedTemplates.filter(t => !t.recommended)

  function handleAssign() {
    if (!selectedTemplate || !selectedInspector) return
    setAssignError(null)
    startTransition(async () => {
      const res = await createItrAssignment({
        projectId,
        tagId,
        subsystemId,
        templateId: selectedTemplate,
        inspectorId: selectedInspector,
        supervisorId: selectedSupervisor || undefined,
        clientId: selectedClient || undefined,
        scheduledDate: scheduledDate || undefined,
      })
      if (res.error) { setAssignError(res.error); return }
      setShowAssign(false)
      setSelectedTemplate('')
      setSelectedInspector('')
      setSelectedSupervisor('')
      setSelectedClient('')
      setScheduledDate('')
      router.refresh()
    })
  }

  function handleDelete(itrId: string) {
    if (!confirm('¿Eliminar este ITR y todas sus respuestas?')) return
    startTransition(async () => {
      await deleteItr(itrId, projectId, tagId)
      router.refresh()
    })
  }

  const templateObj = templates.find(t => t.id === selectedTemplate)

  return (
    <div style={{ padding: '24px 0' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {tagItrs.length === 0 ? 'No hay ITRs asignados a este tag.' : `${tagItrs.length} ITR${tagItrs.length > 1 ? 's' : ''} asignados`}
        </p>
        {canEdit && (
          <button
            onClick={() => setShowAssign(true)}
            style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Asignar ITR
          </button>
        )}
      </div>

      {/* ITR list */}
      {tagItrs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tagItrs.map(itr => {
            const st = ITR_STATUS_COLORS[itr.status] ?? ITR_STATUS_COLORS.not_started
            const stLabel = ITR_STATUS_LABELS[itr.status] ?? ITR_STATUS_LABELS.not_started
            const executor = itr.itr_assignments.find(a => a.role === 'executor')
            const tmpl = itr.itr_templates
            const phase = itr.project_phases

            return (
              <div
                key={itr.id}
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}
              >
                {/* Phase badge */}
                {phase && (
                  <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: phase.color, whiteSpace: 'nowrap' }}>
                    {phase.code}
                  </span>
                )}

                {/* Code + title */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                    {itr.itr_number}
                  </div>
                  {tmpl && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tmpl.title}
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ width: '80px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '3px', textAlign: 'right' }}>{itr.progress_pct}%</div>
                  <div style={{ height: '5px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '3px', transition: 'width 0.3s' }} />
                  </div>
                </div>

                {/* Status pill */}
                <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {stLabel}
                </span>

                {/* Signatures */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['executor', 'supervisor', 'client'] as const).map(role => {
                    const signed = itr.itr_signatures.some(s => s.role === role)
                    return (
                      <span key={role} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: signed ? '#ecfdf5' : 'var(--gray-50)', color: signed ? '#10b981' : 'var(--gray-300)', border: `1px solid ${signed ? '#a7f3d0' : 'var(--border)'}`, fontWeight: 600 }}>
                        {SIGN_LABELS[role]}
                      </span>
                    )
                  })}
                </div>

                {/* Inspector */}
                {executor?.profiles?.full_name && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {executor.profiles.full_name}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <a
                    href={`/projects/${projectId}/tags/${tagId}/itrs/${itr.id}`}
                    style={{ padding: '6px 12px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--gray-700)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
                  >
                    Abrir →
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => setPlanModalItr({
                        id: itr.id,
                        itrNumber: itr.itr_number,
                        tagNumber: tagNumber,
                        defaultAssignedTo: executor?.user_id,
                      })}
                      style={{ padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px', color: '#16a34a', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      title="Agregar a plan de trabajo"
                    >
                      + Plan
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(itr.id)}
                      disabled={isPending}
                      style={{ padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', color: '#ef4444', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add to Plan Modal ─────────────────────────────────────── */}
      {planModalItr && (
        <AddToWorkPlanModal
          projectId={projectId}
          itrs={[planModalItr]}
          members={planModalMembers}
          onClose={() => setPlanModalItr(null)}
          onSuccess={() => { setPlanModalItr(null); router.refresh() }}
        />
      )}

      {/* ── Assign Modal ──────────────────────────────────────────── */}
      {showAssign && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAssign(false) }}
        >
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>Asignar ITR</h2>
              <button onClick={() => setShowAssign(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '18px' }}>✕</button>
            </div>

            {templates.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                No hay templates activos para la disciplina de este tag.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Template selector */}
                <div>
                  <label style={labelStyle}>
                    Template *
                    {tagType && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 6px' }}>
                        {tagType.typeName}
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={e => setSelectedTemplate(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">Seleccionar template...</option>
                    {recommended.length > 0 && (
                      <optgroup label={`⭐ Recomendados para ${tagType?.typeName ?? 'este tag'}`}>
                        {recommended.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.code} — {t.title} {t.project_phases ? `[${t.project_phases.code}]` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={recommended.length > 0 ? 'Todos los templates' : 'Templates disponibles'}>
                      {others.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.code} — {t.title} {t.project_phases ? `[${t.project_phases.code}]` : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {templateObj?.project_phases && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      Fase: <strong>{templateObj.project_phases.name}</strong>
                    </p>
                  )}
                </div>

                {/* Inspector selector */}
                <div>
                  <label style={labelStyle}>Inspector * (Ejecutor)</label>
                  <select
                    value={selectedInspector}
                    onChange={e => setSelectedInspector(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">Seleccionar inspector...</option>
                    {orgMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name ?? m.user_id} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supervisor selector */}
                <div>
                  <label style={labelStyle}>Supervisor <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opcional)</span></label>
                  <select
                    value={selectedSupervisor}
                    onChange={e => setSelectedSupervisor(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">Sin asignar</option>
                    {orgMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name ?? m.user_id} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Client selector */}
                <div>
                  <label style={labelStyle}>Cliente <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opcional)</span></label>
                  <select
                    value={selectedClient}
                    onChange={e => setSelectedClient(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">Sin asignar</option>
                    {orgMembers.filter(m => m.role === 'client').length > 0
                      ? orgMembers.filter(m => m.role === 'client').map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name ?? m.user_id}
                          </option>
                        ))
                      : orgMembers.map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name ?? m.user_id} ({m.role})
                          </option>
                        ))
                    }
                  </select>
                </div>

                {/* Scheduled date */}
                <div>
                  <label style={labelStyle}>Fecha programada (opcional)</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    style={selStyle}
                  />
                </div>

                {assignError && (
                  <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: 0 }}>
                    {assignError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => setShowAssign(false)}
                    style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={!selectedTemplate || !selectedInspector || isPending}
                    style={{ padding: '9px 20px', background: !selectedTemplate || !selectedInspector || isPending ? '#93c5fd' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !selectedTemplate || !selectedInspector || isPending ? 'not-allowed' : 'pointer' }}
                  >
                    {isPending ? 'Asignando...' : 'Asignar →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px',
}
const selStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', fontFamily: 'inherit',
}
