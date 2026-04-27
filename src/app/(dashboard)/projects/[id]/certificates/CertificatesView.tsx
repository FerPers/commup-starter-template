'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { issueCertificate } from '@/app/actions/certificates'

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = {
  id: string
  code: string
  name: string
  color: string
  certificate_name: string | null
}

type CertRow = {
  id: string
  certificate_number: string
  title: string
  status: string
  issued_date: string | null
}

type PhaseEligibility = {
  phaseId: string
  totalItrs: number
  approvedItrs: number
  openCatA: number
  openCatBPunches: { id: string; punch_number: string; description: string }[]
  certificate: CertRow | null
  eligible: 'green' | 'yellow' | 'red'
}

type SubsystemRow = {
  id: string
  code: string
  name: string
  system: { id: string; code: string; name: string } | null
  phaseData: PhaseEligibility[]
}

// ── Config (colors only) ──────────────────────────────────────────────────

const SEMAPHORE_COLORS = {
  green:  { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  yellow: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  red:    { color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
} as const

const CERT_STATUS_COLORS = {
  pending:   { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_review: { color: '#3b82f6', bg: '#eff6ff' },
  issued:    { color: '#10b981', bg: '#ecfdf5' },
  rejected:  { color: '#ef4444', bg: '#fee2e2' },
} as const

// ── Main component ─────────────────────────────────────────────────────────

export default function CertificatesView({
  projectId,
  projectName,
  phases,
  subsystemRows,
  canEdit,
}: {
  projectId: string
  projectName: string
  phases: Phase[]
  subsystemRows: SubsystemRow[]
  canEdit: boolean
}) {
  const t      = useTranslations('Certificates')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(phases[0]?.id ?? '')
  const [issueModal, setIssueModal] = useState<{
    subsystem: SubsystemRow
    phase: Phase
    phaseEl: PhaseEligibility
  } | null>(null)
  const [catBJustifications, setCatBJustifications] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [issueError, setIssueError] = useState('')

  const selectedPhase = phases.find(p => p.id === selectedPhaseId) ?? phases[0]

  const certStatusLabels: Record<string, string> = {
    pending:   t('status.pending'),
    in_review: t('status.in_review'),
    issued:    t('status.issued'),
    rejected:  t('status.rejected'),
  }

  const semLabels: Record<string, string> = {
    green:  t('view.semaphore.green'),
    yellow: t('view.semaphore.yellow'),
    red:    t('view.semaphore.red'),
  }

  // Filter subsystems that have at least 1 ITR in the selected phase
  const allSubsystems = subsystemRows.filter(ss => {
    const pd = ss.phaseData.find(p => p.phaseId === selectedPhaseId)
    return pd !== undefined
  })

  // Summary counts for selected phase
  const greenCount  = allSubsystems.filter(ss => ss.phaseData.find(p => p.phaseId === selectedPhaseId)?.eligible === 'green').length
  const yellowCount = allSubsystems.filter(ss => ss.phaseData.find(p => p.phaseId === selectedPhaseId)?.eligible === 'yellow').length
  const issuedCount = allSubsystems.filter(ss => {
    const cert = ss.phaseData.find(p => p.phaseId === selectedPhaseId)?.certificate
    return cert && cert.status === 'issued'
  }).length

  function openIssueModal(ss: SubsystemRow, phase: Phase, phaseEl: PhaseEligibility) {
    setCatBJustifications({})
    setNotes('')
    setIssueError('')
    setIssueModal({ subsystem: ss, phase, phaseEl })
  }

  function handleIssue() {
    if (!issueModal) return
    setIssueError('')

    const catBExceptions = issueModal.phaseEl.openCatBPunches.map(p => ({
      punchId: p.id,
      justification: catBJustifications[p.id] ?? '',
    }))

    startTransition(async () => {
      const result = await issueCertificate({
        projectId,
        subsystemId: issueModal.subsystem.id,
        phaseId: issueModal.phase.id,
        notes: notes.trim() || undefined,
        catBExceptions,
      })
      if (result.error) {
        setIssueError(result.error)
      } else {
        setIssueModal(null)
        router.refresh()
        if (result.certId) {
          router.push(`/projects/${projectId}/certificates/${result.certId}`)
        }
      }
    })
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${projectId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '16px',
        }}>
          {t('view.backLink', { projectName })}
        </a>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
          {t('view.title')}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {t('view.subtitle')}
        </p>
      </div>

      {/* Phase tabs */}
      {phases.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {phases.map(ph => (
            <button
              key={ph.id}
              onClick={() => setSelectedPhaseId(ph.id)}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer', border: '1px solid',
                background: selectedPhaseId === ph.id ? ph.color : 'var(--card-bg)',
                color: selectedPhaseId === ph.id ? 'white' : 'var(--text-muted)',
                borderColor: selectedPhaseId === ph.id ? ph.color : 'var(--border)',
                transition: 'all 0.15s',
              }}
            >
              {ph.certificate_name ?? ph.code} — {ph.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary strip */}
      {selectedPhase && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { labelKey: 'view.summary.greenLabel',  value: greenCount,  color: '#10b981', bg: '#ecfdf5' },
            { labelKey: 'view.summary.yellowLabel', value: yellowCount, color: '#f59e0b', bg: '#fffbeb' },
            { labelKey: 'view.summary.issuedLabel', value: issuedCount, color: '#7c3aed', bg: '#f5f3ff' },
          ].map(s => (
            <div key={s.labelKey} style={{
              background: s.bg, borderRadius: '10px', padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px',
            }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                {t(s.labelKey as Parameters<typeof t>[0])}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {allSubsystems.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '48px', textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>{t('view.empty')}</p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>{t('view.emptyHint')}</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                {[t('view.colSubsystem'), t('view.colSystem'), t('view.colItrs'), t('view.colCatA'), t('view.colCatB'), t('view.colStatus'), t('view.colCert'), ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '11px 16px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSubsystems.map((ss, idx) => {
                const pd = ss.phaseData.find(p => p.phaseId === selectedPhaseId)
                if (!pd) return null
                const semColors = SEMAPHORE_COLORS[pd.eligible]
                const semLabel  = pd.eligible === 'red' && pd.totalItrs === 0
                  ? t('view.semaphore.noItrs')
                  : semLabels[pd.eligible]
                const certColors = pd.certificate
                  ? (CERT_STATUS_COLORS[pd.certificate.status as keyof typeof CERT_STATUS_COLORS] ?? CERT_STATUS_COLORS.pending)
                  : null
                const certLabel = pd.certificate ? (certStatusLabels[pd.certificate.status] ?? pd.certificate.status) : null
                const canIssue  = canEdit && !pd.certificate && (pd.eligible === 'green' || pd.eligible === 'yellow')

                return (
                  <tr key={ss.id} style={{
                    borderBottom: idx < allSubsystems.length - 1 ? '1px solid #f1f5f9' : 'none',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{ss.code}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{ss.name}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {ss.system ? ss.system.code : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: pd.approvedItrs === pd.totalItrs && pd.totalItrs > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>
                          {pd.approvedItrs}
                        </span>
                        <span style={{ color: '#94a3b8' }}>/ {pd.totalItrs}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                        background: pd.openCatA > 0 ? '#fee2e2' : '#ecfdf5',
                        color: pd.openCatA > 0 ? '#ef4444' : '#10b981',
                      }}>
                        {pd.openCatA}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                        background: pd.openCatBPunches.length > 0 ? '#fffbeb' : 'var(--gray-100)',
                        color: pd.openCatBPunches.length > 0 ? '#f59e0b' : 'var(--text-muted)',
                      }}>
                        {pd.openCatBPunches.length}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                        background: semColors.bg, color: semColors.color, border: `1px solid ${semColors.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {semLabel}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {pd.certificate && certColors && certLabel ? (
                        <a href={`/projects/${projectId}/certificates/${pd.certificate.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontWeight: 500, color: '#3b82f6', fontSize: '12px' }}>
                            {pd.certificate.certificate_number}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                            <span style={{
                              padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
                              background: certColors.bg, color: certColors.color,
                            }}>
                              {certLabel}
                            </span>
                            {pd.certificate.issued_date && (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {new Date(pd.certificate.issued_date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {canIssue && selectedPhase && (
                        <button
                          onClick={() => openIssueModal(ss, selectedPhase, pd)}
                          style={{
                            padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                            cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                            background: pd.eligible === 'green' ? '#10b981' : '#f59e0b',
                            color: 'white',
                          }}
                        >
                          {t('view.issueBtn', { certName: selectedPhase.certificate_name ?? selectedPhase.code })}
                        </button>
                      )}
                      {pd.certificate && (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <a
                            href={`/projects/${projectId}/certificates/${pd.certificate.id}`}
                            style={{
                              padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                              cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card-bg)',
                              color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block',
                            }}
                          >
                            {t('view.viewBtn')}
                          </a>
                          {pd.certificate.status === 'issued' && (
                            <a
                              href={`/projects/${projectId}/certificates/${pd.certificate.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                                cursor: 'pointer', border: '1px solid #bbf7d0', background: '#f0fdf4',
                                color: '#15803d', textDecoration: 'none', display: 'inline-block',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ⬇ {t('view.pdfBtn')}
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Issue Certificate Modal */}
      {issueModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}
          onClick={e => { if (e.target === e.currentTarget) setIssueModal(null) }}
        >
          <div style={{
            background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '540px',
            maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '22px 24px 18px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
                  {t('view.modal.title', { certName: issueModal.phase.certificate_name ?? issueModal.phase.code })}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {issueModal.subsystem.code} — {issueModal.subsystem.name}
                </p>
              </div>
              <button
                onClick={() => setIssueModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* ITR summary */}
              <div style={{
                background: 'var(--gray-50)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
                display: 'flex', gap: '24px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('view.modal.itrsApproved')}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
                    {issueModal.phaseEl.approvedItrs} / {issueModal.phaseEl.totalItrs}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('view.modal.catAPunches')}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>0</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('view.modal.catBPunches')}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: issueModal.phaseEl.openCatBPunches.length > 0 ? '#f59e0b' : '#10b981', marginTop: '2px' }}>
                    {issueModal.phaseEl.openCatBPunches.length}
                  </div>
                </div>
              </div>

              {/* Cat B exceptions */}
              {issueModal.phaseEl.openCatBPunches.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 10px' }}>
                    {t('view.modal.catBTitle')}
                    <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 400, marginLeft: '6px' }}>{t('view.modal.catBRequired')}</span>
                  </p>
                  {issueModal.phaseEl.openCatBPunches.map(punch => (
                    <div key={punch.id} style={{
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
                      padding: '12px 14px', marginBottom: '10px',
                    }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '8px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, color: '#f59e0b',
                          background: '#fef3c7', padding: '2px 7px', borderRadius: '4px',
                        }}>
                          {punch.punch_number}
                        </span>
                        <span style={{ fontSize: '12px', color: '#78350f' }}>{punch.description}</span>
                      </div>
                      <textarea
                        placeholder={t('view.modal.catBPlaceholder')}
                        value={catBJustifications[punch.id] ?? ''}
                        onChange={e => setCatBJustifications(prev => ({ ...prev, [punch.id]: e.target.value }))}
                        style={{
                          width: '100%', minHeight: '56px', padding: '8px 10px',
                          border: '1px solid #fde68a', borderRadius: '6px',
                          fontSize: '12px', resize: 'vertical', fontFamily: 'inherit',
                          background: 'var(--card-bg)', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  {t('view.modal.notesLabel')}
                </label>
                <textarea
                  placeholder={t('view.modal.notesPlaceholder')}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{
                    width: '100%', minHeight: '64px', padding: '10px 12px',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    fontSize: '13px', resize: 'vertical', fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {issueError && (
                <div style={{
                  background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px',
                  padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px',
                }}>
                  {issueError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setIssueModal(null)}
                  style={{
                    padding: '9px 20px', border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  {t('view.modal.cancel')}
                </button>
                <button
                  onClick={handleIssue}
                  disabled={isPending}
                  style={{
                    padding: '9px 20px', border: 'none', borderRadius: '8px',
                    background: isPending ? '#94a3b8' : '#10b981',
                    color: 'white', fontSize: '13px', fontWeight: 600,
                    cursor: isPending ? 'wait' : 'pointer',
                  }}
                >
                  {isPending
                    ? t('view.modal.submitting')
                    : t('view.modal.submit', { certName: issueModal.phase.certificate_name ?? issueModal.phase.code })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}