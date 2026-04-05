'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

// ── Config ────────────────────────────────────────────────────────────────

const SEMAPHORE = {
  green:  { label: 'Elegible',     color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  yellow: { label: 'Cat B abier.', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  red:    { label: 'Bloqueado',    color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
} as const

const CERT_STATUS = {
  pending:   { label: 'Pendiente',   color: '#64748b', bg: '#f1f5f9' },
  in_review: { label: 'En revisión', color: '#3b82f6', bg: '#eff6ff' },
  issued:    { label: 'Emitido',     color: '#10b981', bg: '#ecfdf5' },
  rejected:  { label: 'Rechazado',   color: '#ef4444', bg: '#fee2e2' },
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

  // Filter subsystems that have at least 1 ITR in the selected phase (hide empty ones)
  const visibleSubsystems = subsystemRows.filter(ss => {
    const pd = ss.phaseData.find(p => p.phaseId === selectedPhaseId)
    return pd && pd.totalItrs > 0
  })

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
          fontSize: '13px', color: '#64748b', textDecoration: 'none', marginBottom: '16px',
        }}>
          ← {projectName}
        </a>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
          Certificados de Completación
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
          MC · RFPC · RFC · RFSU por subsistema
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
                background: selectedPhaseId === ph.id ? ph.color : 'white',
                color: selectedPhaseId === ph.id ? 'white' : '#475569',
                borderColor: selectedPhaseId === ph.id ? ph.color : '#e2e8f0',
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
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Elegibles sin bloqueo', value: greenCount, color: '#10b981', bg: '#ecfdf5' },
            { label: 'Con Cat B abiertos', value: yellowCount, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Certificados emitidos', value: issuedCount, color: '#7c3aed', bg: '#f5f3ff' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: '10px', padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px',
            }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.3' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {allSubsystems.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          padding: '48px', textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            No hay subsistemas con ITRs asignados en esta fase.
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            Asigna ITRs a los tags del subsistema para que aparezca aquí.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Subsistema', 'Sistema', 'ITRs', 'Cat A', 'Cat B', 'Estado', 'Certificado', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '11px 16px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: '#64748b',
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
                const sem = SEMAPHORE[pd.eligible]
                const certStatus = pd.certificate ? CERT_STATUS[pd.certificate.status as keyof typeof CERT_STATUS] : null
                const canIssue = canEdit && !pd.certificate && (pd.eligible === 'green' || pd.eligible === 'yellow')

                return (
                  <tr key={ss.id} style={{
                    borderBottom: idx < allSubsystems.length - 1 ? '1px solid #f1f5f9' : 'none',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{ss.code}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{ss.name}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {ss.system ? `${ss.system.code}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: pd.approvedItrs === pd.totalItrs && pd.totalItrs > 0 ? '#10b981' : '#64748b', fontWeight: 600 }}>
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
                        background: pd.openCatBPunches.length > 0 ? '#fffbeb' : '#f1f5f9',
                        color: pd.openCatBPunches.length > 0 ? '#f59e0b' : '#64748b',
                      }}>
                        {pd.openCatBPunches.length}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                        background: sem.bg, color: sem.color, border: `1px solid ${sem.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {pd.eligible === 'red' && pd.totalItrs === 0 ? 'Sin ITRs' : sem.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {pd.certificate && certStatus ? (
                        <a
                          href={`/projects/${projectId}/certificates/${pd.certificate.id}`}
                          style={{ textDecoration: 'none' }}
                        >
                          <div style={{ fontWeight: 500, color: '#3b82f6', fontSize: '12px' }}>
                            {pd.certificate.certificate_number}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                            <span style={{
                              padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
                              background: certStatus.bg, color: certStatus.color,
                            }}>
                              {certStatus.label}
                            </span>
                            {pd.certificate.issued_date && (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {new Date(pd.certificate.issued_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
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
                          Emitir {selectedPhase.certificate_name ?? selectedPhase.code}
                        </button>
                      )}
                      {pd.certificate && (
                        <a
                          href={`/projects/${projectId}/certificates/${pd.certificate.id}`}
                          style={{
                            padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                            cursor: 'pointer', border: '1px solid #e2e8f0', background: 'white',
                            color: '#475569', textDecoration: 'none', display: 'inline-block',
                          }}
                        >
                          Ver →
                        </a>
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
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '540px',
            maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '22px 24px 18px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Emitir {issueModal.phase.certificate_name ?? issueModal.phase.code}
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
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
                background: '#f8fafc', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
                display: 'flex', gap: '24px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ITRs aprobados</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
                    {issueModal.phaseEl.approvedItrs} / {issueModal.phaseEl.totalItrs}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Punches Cat A</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>0</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Punches Cat B</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: issueModal.phaseEl.openCatBPunches.length > 0 ? '#f59e0b' : '#10b981', marginTop: '2px' }}>
                    {issueModal.phaseEl.openCatBPunches.length}
                  </div>
                </div>
              </div>

              {/* Cat B exceptions */}
              {issueModal.phaseEl.openCatBPunches.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: '0 0 10px' }}>
                    Justificación para punches Cat B abiertos
                    <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 400, marginLeft: '6px' }}>* requerida</span>
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
                        placeholder="Justificación para exceptuar este punch Cat B..."
                        value={catBJustifications[punch.id] ?? ''}
                        onChange={e => setCatBJustifications(prev => ({ ...prev, [punch.id]: e.target.value }))}
                        style={{
                          width: '100%', minHeight: '56px', padding: '8px 10px',
                          border: '1px solid #fde68a', borderRadius: '6px',
                          fontSize: '12px', resize: 'vertical', fontFamily: 'inherit',
                          background: 'white', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Notas adicionales
                </label>
                <textarea
                  placeholder="Observaciones del certificado (opcional)..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{
                    width: '100%', minHeight: '64px', padding: '10px 12px',
                    border: '1px solid #e2e8f0', borderRadius: '8px',
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
                    padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: '8px',
                    background: 'white', color: '#475569', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Cancelar
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
                  {isPending ? 'Emitiendo...' : `Emitir ${issueModal.phase.certificate_name ?? issueModal.phase.code}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
