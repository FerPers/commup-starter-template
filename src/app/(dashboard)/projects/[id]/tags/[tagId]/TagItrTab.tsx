'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createItrAssignment, deleteItr } from '@/app/actions/itr-instances'
import { detectTagType, sortTemplatesByRelevance } from '@/lib/tag-types'
import AddToWorkPlanModal, { type ModalItr } from '@/components/AddToWorkPlanModal'
import type { TagItr, ItrTemplate, OrgMember } from './TagDetail'
import { ITR_STATUS_COLORS } from '@/lib/constants/status-colors'
import { assignmentIssue, normalizeRequired, requiredForTemplate } from '@/lib/itr/signatures'
import { ink } from '@/lib/theme'

// ── Status config ────────────────────────────────────────────────────

const ITR_STATUSES = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'] as const
type ItrStatusKey = (typeof ITR_STATUSES)[number]
const SIGN_ROLES = ['executor', 'supervisor', 'client'] as const
type SignRoleKey = (typeof SIGN_ROLES)[number]

// ── Props ────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  tagId: string
  tagNumber: string
  equipmentTypeId?: string | null
  subsystemId: string
  tagItrs: TagItr[]
  templates: ItrTemplate[]
  matrixTemplateIds?: string[]
  orgMembers: OrgMember[]
  /** S14 (I-25): representantes del cliente designados en el proyecto (vacío = regla de antes). */
  clientRepIds?: string[]
  canEdit: boolean
}

// ── Component ────────────────────────────────────────────────────────

export default function TagItrTab({
  projectId,
  tagId,
  tagNumber,
  equipmentTypeId,
  subsystemId,
  tagItrs,
  templates,
  matrixTemplateIds,
  orgMembers,
  clientRepIds = [],
  canEdit,
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('TagItrs')
  const tr = useTranslations('Users')
  const te = useTranslations('ActionErrors')
  const roleLabel = (role: string) => (['owner', 'admin', 'architect', 'leader', 'inspector', 'client'].includes(role) ? tr(`roles.${role as 'owner'}`) : role)
  // Título de plantilla según idioma del usuario (title_es si existe)
  const tplTitle = (tpl: { title: string; title_es?: string | null }) => (locale === 'es' && tpl.title_es?.trim()) ? tpl.title_es : tpl.title
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
  // S14 (I-25): designados > usuarios con rol cliente > todos (la BD vuelve a validarlo).
  const clientCandidates = clientRepIds.length > 0
    ? orgMembers.filter(m => clientRepIds.includes(m.user_id))
    : orgMembers.filter(m => m.role === 'client')
  const planModalMembers = orgMembers.map(m => ({
    user_id: m.user_id,
    full_name: m.profiles?.full_name ?? m.user_id,
  }))

  // Tag type detection for ITR recommendations
  const tagType = detectTagType(tagNumber)
  const sortedTemplates = sortTemplatesByRelevance(templates, tagType, equipmentTypeId, matrixTemplateIds)

  const recommended = sortedTemplates.filter(x => x.recommended)
  const others       = sortedTemplates.filter(x => !x.recommended)

  // S04 (D4/D6): la plantilla (y su fase) dicen qué firmas pide el ITR; una persona distinta por rol.
  const selectedTpl = templates.find(x => x.id === selectedTemplate)
  const requiredRoles = selectedTpl ? requiredForTemplate(selectedTpl.required_signatures, selectedTpl.project_phases?.itr_client_signature) : normalizeRequired(null)
  const needsSupervisor = requiredRoles.includes('supervisor')
  const needsClient = requiredRoles.includes('client')
  const people = { executor: selectedInspector, supervisor: needsSupervisor ? selectedSupervisor : null, client: needsClient ? selectedClient : null }
  const formIssue = selectedTemplate && selectedInspector ? assignmentIssue(requiredRoles, people) : null
  const formError = formIssue ? te(`itrAssign.${formIssue.code}`, formIssue) : null

  function handleAssign() {
    if (!selectedTemplate || !selectedInspector) return
    if (formError) { setAssignError(formError); return }
    setAssignError(null)
    startTransition(async () => {
      const res = await createItrAssignment({
        projectId,
        tagId,
        subsystemId,
        templateId: selectedTemplate,
        inspectorId: selectedInspector,
        supervisorId: (needsSupervisor && selectedSupervisor) || undefined,
        clientId: (needsClient && selectedClient) || undefined,
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
    if (!confirm(t('deleteConfirm'))) return
    startTransition(async () => {
      const res = await deleteItr(itrId, projectId, tagId)
      if (res.error) { window.alert(res.error); return }
      router.refresh()
    })
  }

  const templateObj = templates.find(x => x.id === selectedTemplate)

  return (
    <div style={{ padding: '24px 0' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {tagItrs.length === 0 ? t('none') : t('count', { count: tagItrs.length })}
        </p>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowAssign(true)}
              style={{ padding: '8px 16px', background: 'var(--primary-500)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              + {t('assign')}
            </button>
          </div>
        )}
      </div>


      {/* ITR list */}
      {tagItrs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tagItrs.map(itr => {
            const st = ITR_STATUS_COLORS[itr.status] ?? ITR_STATUS_COLORS.not_started
            const stLabel = t(`status.${(ITR_STATUSES as readonly string[]).includes(itr.status) ? itr.status as ItrStatusKey : 'not_started'}`)
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
                  <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: ink(phase.color), whiteSpace: 'nowrap' }}>
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
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: '3px', transition: 'width 0.3s' }} />
                  </div>
                </div>

                {/* Status pill */}
                <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {stLabel}
                </span>

                {/* Signatures */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {normalizeRequired(itr.required_signatures).map(role => {
                    const signed = itr.itr_signatures.some(s => s.role === role)
                    return (
                      <span key={role} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: signed ? 'var(--success-50)' : 'var(--gray-50)', color: signed ? 'var(--success-500)' : 'var(--gray-300)', border: `1px solid ${signed ? 'var(--success-200)' : 'var(--border)'}`, fontWeight: 600 }}>
                        {(SIGN_ROLES as readonly string[]).includes(role) ? t(`sign.${role as SignRoleKey}`) : role}
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
                    {t('open')} →
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => setPlanModalItr({
                        id: itr.id,
                        itrNumber: itr.itr_number,
                        tagNumber: tagNumber,
                        defaultAssignedTo: executor?.user_id,
                      })}
                      style={{ padding: '6px 10px', background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: '6px', fontSize: '11px', color: 'var(--success-600)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      title={t('addToPlan')}
                    >
                      + {t('plan')}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(itr.id)}
                      disabled={isPending}
                      style={{ padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid var(--danger-200)', borderRadius: '6px', fontSize: '12px', color: 'var(--danger-500)', cursor: 'pointer' }}
                      aria-label={t('delete')}
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
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('assign')}</h2>
              <button onClick={() => setShowAssign(false)} aria-label={t('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '18px' }}>✕</button>
            </div>

            {templates.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                {t('noTemplates')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Template selector */}
                <div>
                  <label style={labelStyle}>
                    {t('template')} *
                    {tagType && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: 'var(--success-700)', background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: '4px', padding: '1px 6px' }}>
                        {tagType.typeName}
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={e => setSelectedTemplate(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">{t('pickTemplate')}</option>
                    {recommended.length > 0 && (
                      <optgroup label={`⭐ ${tagType ? t('recommendedFor', { type: tagType.typeName }) : t('recommended')}`}>
                        {recommended.map(x => (
                          <option key={x.id} value={x.id}>
                            {x.code} — {tplTitle(x)} {x.project_phases ? `[${x.project_phases.code}]` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={recommended.length > 0 ? t('allTemplates') : t('availableTemplates')}>
                      {others.map(x => (
                        <option key={x.id} value={x.id}>
                          {x.code} — {tplTitle(x)} {x.project_phases ? `[${x.project_phases.code}]` : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {templateObj?.project_phases && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      {t.rich('phaseName', { name: templateObj.project_phases.name, strong: chunks => <strong>{chunks}</strong> })}
                    </p>
                  )}
                </div>

                {/* Inspector selector */}
                <div>
                  <label style={labelStyle}>{t('executor')}</label>
                  <select
                    value={selectedInspector}
                    onChange={e => setSelectedInspector(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">{t('pickExecutor')}</option>
                    {orgMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name ?? m.user_id} ({roleLabel(m.role)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supervisor selector — S04: solo si la plantilla lo pide, y entonces obligatorio */}
                {needsSupervisor && <div>
                  <label style={labelStyle}>{t('supervisor')}</label>
                  <select
                    value={selectedSupervisor}
                    onChange={e => setSelectedSupervisor(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">{t('pickSupervisor')}</option>
                    {orgMembers.filter(m => m.user_id !== selectedInspector).map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name ?? m.user_id} ({roleLabel(m.role)})
                      </option>
                    ))}
                  </select>
                </div>}

                {/* Client selector — S04: solo si la plantilla o la fase lo piden */}
                {needsClient && <div>
                  <label style={labelStyle}>{t('client')}</label>
                  <select
                    value={selectedClient}
                    onChange={e => setSelectedClient(e.target.value)}
                    style={selStyle}
                  >
                    <option value="">{t('pickClient')}</option>
                    {clientCandidates.length > 0
                      ? clientCandidates.map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name ?? m.user_id}
                          </option>
                        ))
                      : orgMembers.map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name ?? m.user_id} ({roleLabel(m.role)})
                          </option>
                        ))
                    }
                  </select>
                </div>}

                {/* Scheduled date */}
                <div>
                  <label style={labelStyle}>{t('scheduled')}</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    style={selStyle}
                  />
                </div>

                {formError && !assignError && (
                  <p style={{ fontSize: '12px', color: 'var(--warning-700)', margin: 0 }}>{formError}</p>
                )}

                {assignError && (
                  <p style={{ fontSize: '12px', color: 'var(--danger-500)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px', margin: 0 }}>
                    {assignError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => setShowAssign(false)}
                    style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={!selectedTemplate || !selectedInspector || !!formError || isPending}
                    style={{ padding: '9px 20px', background: !selectedTemplate || !selectedInspector || formError || isPending ? 'var(--primary-300)' : 'var(--primary-500)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !selectedTemplate || !selectedInspector || formError || isPending ? 'not-allowed' : 'pointer' }}
                  >
                    {isPending ? t('assigning') : `${t('assignShort')} →`}
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
