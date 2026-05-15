'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { revokeCertificate, reopenCertificate, signCertificate, removeCertificateSignature } from '@/app/actions/certificates'

type CertSignatureRoleId = 'completion' | 'client' | 'authority'

// ── Types ──────────────────────────────────────────────────────────────────

type CertFull = {
  id: string
  certificate_number: string
  title: string
  status: 'pending' | 'in_review' | 'issued' | 'rejected'
  issued_date: string | null
  notes: string | null
  created_at: string
  project_phases: { id: string; code: string; name: string; color: string; certificate_name: string | null } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } | null } | null
  issued_by_profile: { id: string; full_name: string } | null
}

type ExceptionRow = {
  id: string
  justification: string
  approved_at: string
  punches: { id: string; punch_number: string; description: string; category: string; status: string } | null
  approved_by_profile: { id: string; full_name: string } | null
}

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  created_at: string
  itr_templates: { code: string; title: string } | null
  tags: { tag_number: string; description: string } | null
}

type SignatureRow = {
  id: string
  role: CertSignatureRoleId
  signature_image: string | null
  comments: string | null
  signed_at: string
  user_id: string
  signer_profile: { id: string; full_name: string } | null
}

// ── Config (colors only) ───────────────────────────────────────────────────

const ITR_STATUS_COLORS = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  completed:   { color: '#10b981', bg: '#ecfdf5' },
  approved:    { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:    { color: '#ef4444', bg: '#fee2e2' },
} as const

const CERT_STATUS_COLORS = {
  pending:   { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_review: { color: '#3b82f6', bg: '#eff6ff' },
  issued:    { color: '#10b981', bg: '#ecfdf5' },
  rejected:  { color: '#ef4444', bg: '#fee2e2' },
} as const

// ── Main component ─────────────────────────────────────────────────────────

export default function CertificateDetail({
  projectId,
  projectName,
  projectCode,
  projectClient,
  cert,
  exceptions,
  itrs,
  signatures,
  currentUserId,
  canEdit,
  isAdmin,
}: {
  projectId: string
  projectName: string
  projectCode: string
  projectClient: string | null
  cert: CertFull
  exceptions: ExceptionRow[]
  itrs: ItrRow[]
  signatures: SignatureRow[]
  currentUserId: string
  canEdit: boolean
  isAdmin: boolean
}) {
  const t      = useTranslations('Certificates')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [revokeError, setRevokeError]     = useState('')
  const [revokeReason, setRevokeReason]   = useState('')
  const [reopenConfirm, setReopenConfirm] = useState(false)
  const [reopenError, setReopenError]     = useState('')
  const [reopenReason, setReopenReason]   = useState('')
  const [signRole, setSignRole]           = useState<CertSignatureRoleId | null>(null)
  const [signComments, setSignComments]   = useState('')
  const [signError, setSignError]         = useState('')

  const phase     = cert.project_phases
  const subsystem = cert.subsystems
  const certColors = CERT_STATUS_COLORS[cert.status] ?? CERT_STATUS_COLORS.pending
  const certStatusLabels: Record<string, string> = {
    pending:   t('detail.certStatus.pending'),
    in_review: t('detail.certStatus.in_review'),
    issued:    t('detail.certStatus.issued'),
    rejected:  t('detail.certStatus.rejected'),
  }
  const itrStatusLabels: Record<string, string> = {
    not_started: t('detail.itrStatus.not_started'),
    in_progress: t('detail.itrStatus.in_progress'),
    completed:   t('detail.itrStatus.completed'),
    approved:    t('detail.itrStatus.approved'),
    rejected:    t('detail.itrStatus.rejected'),
  }

  const approvedItrs = itrs.filter(i => i.status === 'approved').length

  function handleRevoke() {
    setRevokeError('')
    startTransition(async () => {
      const result = await revokeCertificate({ certId: cert.id, projectId, reason: revokeReason })
      if (result.error) {
        setRevokeError(result.error)
      } else {
        setRevokeConfirm(false)
        setRevokeReason('')
        router.refresh()
      }
    })
  }

  function handleReopen() {
    setReopenError('')
    startTransition(async () => {
      const result = await reopenCertificate({ certId: cert.id, projectId, reason: reopenReason })
      if (result.error) {
        setReopenError(result.error)
      } else {
        setReopenConfirm(false)
        setReopenReason('')
        router.refresh()
      }
    })
  }

  function openSignModal(role: CertSignatureRoleId) {
    setSignError('')
    setSignComments('')
    setSignRole(role)
  }

  function handleSign(signatureImage: string) {
    if (!signRole) return
    setSignError('')
    startTransition(async () => {
      const result = await signCertificate({
        certId: cert.id,
        role: signRole,
        projectId,
        comments: signComments || undefined,
        signatureImage,
      })
      if (result.error) {
        setSignError(result.error)
      } else {
        setSignRole(null)
        setSignComments('')
        router.refresh()
      }
    })
  }

  function handleUnsign(signatureId: string) {
    setSignError('')
    startTransition(async () => {
      const result = await removeCertificateSignature({
        signatureId,
        certId: cert.id,
        projectId,
      })
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const SIG_ROLES: CertSignatureRoleId[] = ['completion', 'client', 'authority']
  const sigByRole = new Map<CertSignatureRoleId, SignatureRow>()
  for (const s of signatures) sigByRole.set(s.role, s)

  return (
    <div style={{ padding: '32px' }}>

      {/* Print styles */}
      <style>{`
        @media print {
          aside, nav, button, .no-print { display: none !important; }
          body { background: white !important; }
          .print-card { box-shadow: none !important; border: 1px solid #ccc !important; }
          .print-page { break-inside: avoid; }
        }
      `}</style>

      {/* Back */}
      <div className="no-print" style={{ marginBottom: '20px' }}>
        <a href={`/projects/${projectId}/certificates`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none',
        }}>
          {t('detail.backLink', { projectName })}
        </a>
      </div>

      {/* Certificate Header */}
      <div className="print-card" style={{
        background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
        padding: '28px 32px', marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: phase ? `${phase.color}20` : 'var(--gray-100)',
              border: `2px solid ${phase?.color ?? 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: phase?.color ?? 'var(--text-muted)',
            }}>
              {phase?.certificate_name ?? phase?.code ?? '—'}
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
                {cert.certificate_number}
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '3px 0 0' }}>{cert.title}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              padding: '5px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
              background: certColors.bg, color: certColors.color,
            }}>
              {certStatusLabels[cert.status] ?? cert.status}
            </span>
            {cert.status === 'issued' && (
              <a
                href={`/projects/${projectId}/certificates/${cert.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="no-print"
                style={{
                  padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: '1px solid #bbf7d0', background: '#f0fdf4',
                  color: '#15803d', textDecoration: 'none', display: 'inline-flex',
                  alignItems: 'center', gap: '5px',
                }}
              >
                ⬇ {t('detail.pdfBtn')}
              </a>
            )}
            {isAdmin && cert.status === 'issued' && (
              <button
                className="no-print"
                onClick={() => setRevokeConfirm(true)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444',
                }}
              >
                {t('detail.revokeBtn')}
              </button>
            )}
            {isAdmin && cert.status === 'rejected' && (
              <button
                className="no-print"
                onClick={() => setReopenConfirm(true)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#3b82f6',
                }}
              >
                {t('detail.reopenBtn')}
              </button>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
          {[
            { label: t('detail.infoProject'),    value: `${projectCode} — ${projectName}` },
            { label: t('detail.infoClient'),     value: projectClient ?? '—' },
            { label: t('detail.infoSystem'),     value: subsystem?.systems ? subsystem.systems.code : '—' },
            { label: t('detail.infoSubsystem'),  value: subsystem ? `${subsystem.code} — ${subsystem.name}` : '—' },
            { label: t('detail.infoPhase'),      value: phase ? `${phase.code} — ${phase.name}` : '—' },
            { label: t('detail.infoIssuedDate'), value: cert.issued_date ? new Date(cert.issued_date).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
            { label: t('detail.infoIssuedBy'),   value: cert.issued_by_profile?.full_name ?? '—' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '10px 0', paddingRight: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-strong)' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {cert.notes && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              {t('detail.notesLabel')}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>{cert.notes}</p>
          </div>
        )}
      </div>

      {/* ITR Completion Table */}
      <div className="print-card print-page" style={{
        background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
        padding: '20px 24px', marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
            {t('detail.itrsTitle', { certName: phase?.certificate_name ?? phase?.code ?? '—' })}
          </h3>
          <span style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: approvedItrs === itrs.length && itrs.length > 0 ? '#ecfdf5' : '#eff6ff',
            color: approvedItrs === itrs.length && itrs.length > 0 ? '#10b981' : '#3b82f6',
          }}>
            {t('detail.itrsApproved', { approved: approvedItrs, total: itrs.length })}
          </span>
        </div>

        {itrs.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>{t('detail.itrsEmpty')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {[t('detail.itrColNumber'), t('detail.itrColTag'), t('detail.itrColTemplate'), t('detail.itrColStatus')].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itrs.map((itr, idx) => {
                const colors = ITR_STATUS_COLORS[itr.status as keyof typeof ITR_STATUS_COLORS] ?? ITR_STATUS_COLORS.not_started
                const label  = itrStatusLabels[itr.status] ?? itr.status
                return (
                  <tr key={itr.id} style={{ borderBottom: idx < itrs.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text-strong)' }}>
                      {itr.itr_number}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>
                      {itr.tags?.tag_number ?? '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>
                      {itr.itr_templates ? `${itr.itr_templates.code} — ${itr.itr_templates.title}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                        background: colors.bg, color: colors.color,
                      }}>
                        {label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Cat B Exceptions */}
      {exceptions.length > 0 && (
        <div className="print-card print-page" style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '20px 24px', marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 16px' }}>
            {t('detail.exceptionsTitle')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {exceptions.map(exc => (
              <div key={exc.id} style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: '#f59e0b',
                    background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap',
                  }}>
                    {exc.punches?.punch_number}
                  </span>
                  <span style={{ fontSize: '13px', color: '#78350f', fontWeight: 500 }}>
                    {exc.punches?.description}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 8px', lineHeight: '1.5' }}>
                  <strong>{t('detail.justificationLabel')}</strong> {exc.justification}
                </p>
                <div style={{ fontSize: '11px', color: '#d97706' }}>
                  {t('detail.approvedBy', { name: exc.approved_by_profile?.full_name ?? '—' })}
                  {' · '}
                  {new Date(exc.approved_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature area */}
      <div className="print-card print-page" style={{
        background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
        padding: '24px 32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 24px' }}>
          {t('detail.signaturesTitle')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>
          {SIG_ROLES.map(role => {
            const sig = sigByRole.get(role)
            const roleLabel = t(`detail.sigRoles.${role}`)
            const isOwner = sig?.user_id === currentUserId
            const canRemove = sig && (isOwner || isAdmin)
            const canSign = canEdit && cert.status === 'issued' && !sig

            return (
              <div key={role}>
                {sig ? (
                  <>
                    <div style={{
                      borderBottom: '1px solid #0f172a', marginBottom: '8px', height: '50px',
                      display: 'flex', alignItems: 'flex-end', justifyContent: sig.signature_image ? 'center' : 'flex-start',
                      paddingBottom: '6px',
                      fontFamily: 'cursive', fontSize: '18px', color: '#0f172a',
                    }}>
                      {sig.signature_image
                        // eslint-disable-next-line @next/next/no-img-element -- base64 signature data URL, Image optimizer doesn't apply
                        ? <img src={sig.signature_image} alt={roleLabel} style={{ maxHeight: '46px', maxWidth: '100%', objectFit: 'contain' }} />
                        : (sig.signer_profile?.full_name ?? '—')
                      }
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>{roleLabel}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {sig.signer_profile?.full_name ?? '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
                      {t('detail.sigSignedOn', {
                        date: new Date(sig.signed_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
                      })}
                    </div>
                    {sig.comments && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>
                        “{sig.comments}”
                      </div>
                    )}
                    {canRemove && (
                      <button
                        className="no-print"
                        onClick={() => handleUnsign(sig.id)}
                        disabled={isPending}
                        style={{
                          marginTop: '10px', padding: '5px 12px', fontSize: '11px', fontWeight: 500,
                          border: '1px solid var(--border)', borderRadius: '6px',
                          background: 'var(--card-bg)', color: 'var(--text-muted)',
                          cursor: isPending ? 'wait' : 'pointer',
                        }}
                      >
                        {isPending ? t('detail.sigUnsigning') : t('detail.sigUnsign')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ borderBottom: '1px dashed var(--border)', marginBottom: '8px', height: '50px' }} />
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{roleLabel}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '3px' }}>
                      {t('detail.sigPending')}
                    </div>
                    {canSign && (
                      <button
                        className="no-print"
                        onClick={() => openSignModal(role)}
                        disabled={isPending}
                        style={{
                          marginTop: '10px', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                          border: '1px solid #bbf7d0', borderRadius: '8px',
                          background: '#f0fdf4', color: '#15803d',
                          cursor: isPending ? 'wait' : 'pointer',
                        }}
                      >
                        {t('detail.sigSign', { role: roleLabel })}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Sign confirm modal (canvas) */}
      {signRole && (
        <CertSignModal
          role={signRole}
          comments={signComments}
          onCommentsChange={setSignComments}
          isPending={isPending}
          signError={signError}
          onCancel={() => { setSignRole(null); setSignError('') }}
          onSign={handleSign}
        />
      )}

      {/* Reopen confirm modal */}
      {reopenConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '14px', padding: '28px',
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>
              {t('detail.reopenModal.title')}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: '1.5' }}
               dangerouslySetInnerHTML={{ __html: t('detail.reopenModal.body', { certNumber: `<strong>${cert.certificate_number}</strong>` }) }}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>
                {t('detail.reopenModal.reasonLabel')}
              </span>
              <textarea
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                rows={3}
                placeholder={t('detail.reopenModal.reasonPlaceholder')}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 }}
              />
            </label>
            {reopenError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 14px' }}>{reopenError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setReopenConfirm(false); setReopenReason(''); setReopenError('') }}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}
              >
                {t('detail.reopenModal.cancel')}
              </button>
              <button
                onClick={handleReopen}
                disabled={isPending || reopenReason.trim().length < 3}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', background: (reopenReason.trim().length < 3) ? '#93c5fd' : '#3b82f6', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (isPending || reopenReason.trim().length < 3) ? 'not-allowed' : 'pointer' }}
              >
                {isPending ? t('detail.reopenModal.submitting') : t('detail.reopenModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm modal */}
      {revokeConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '14px', padding: '28px',
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>
              {t('detail.revokeModal.title')}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: '1.5' }}
               dangerouslySetInnerHTML={{ __html: t('detail.revokeModal.body', { certNumber: `<strong>${cert.certificate_number}</strong>` }) }}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>
                {t('detail.revokeModal.reasonLabel')}
              </span>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                rows={3}
                placeholder={t('detail.revokeModal.reasonPlaceholder')}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 }}
              />
            </label>
            {revokeError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 14px' }}>{revokeError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setRevokeConfirm(false); setRevokeReason(''); setRevokeError('') }}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}
              >
                {t('detail.revokeModal.cancel')}
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending || revokeReason.trim().length < 3}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', background: (revokeReason.trim().length < 3) ? '#fca5a5' : '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (isPending || revokeReason.trim().length < 3) ? 'not-allowed' : 'pointer' }}
              >
                {isPending ? t('detail.revokeModal.submitting') : t('detail.revokeModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Certificate Sign Modal (canvas drawing pad) ────────────────────────────

function CertSignModal({
  role,
  comments,
  onCommentsChange,
  isPending,
  signError,
  onCancel,
  onSign,
}: {
  role: CertSignatureRoleId
  comments: string
  onCommentsChange: (v: string) => void
  isPending: boolean
  signError: string
  onCancel: () => void
  onSign: (signatureImage: string) => void
}) {
  const t = useTranslations('Certificates')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#0f172a'
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
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    setHasDrawn(true)
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pt = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPoint.current = pt
  }

  function onPointerUp() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  function submit() {
    if (!hasDrawn) return
    onSign(canvasRef.current!.toDataURL('image/png'))
  }

  return (
    <div className="no-print" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '20px',
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px', padding: '24px',
        maxWidth: '440px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>
          {t('detail.sigConfirmTitle', { role: t(`detail.sigRoles.${role}`) })}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: '1.5' }}>
          {t('detail.sigConfirmBody')}
        </p>

        {/* Canvas drawing pad */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>
              {t('detail.sigCanvasLabel')}
            </label>
            <button
              onClick={clearCanvas}
              style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              {t('detail.sigCanvasClear')}
            </button>
          </div>
          <div style={{ position: 'relative', border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--gray-50)' }}>
            <canvas
              ref={canvasRef}
              width={392}
              height={160}
              style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {!hasDrawn && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--gray-300)' }}>{t('detail.sigCanvasPlaceholder')}</span>
              </div>
            )}
          </div>
        </div>

        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
          {t('detail.sigCommentsLabel')}
        </label>
        <textarea
          value={comments}
          onChange={e => onCommentsChange(e.target.value)}
          placeholder={t('detail.sigCommentsPlaceholder')}
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: '8px',
            border: '1px solid var(--border)', fontSize: '13px',
            background: 'var(--card-bg)', color: 'var(--text-strong)',
            fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        {signError && (
          <p style={{ fontSize: '13px', color: '#ef4444', margin: '12px 0 0' }}>{signError}</p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}
          >
            {t('detail.sigCancel')}
          </button>
          <button
            onClick={submit}
            disabled={isPending || !hasDrawn}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: '8px',
              background: (isPending || !hasDrawn) ? '#a7f3d0' : '#10b981',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: (isPending || !hasDrawn) ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? t('detail.sigSigning') : t('detail.sigConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  )
}