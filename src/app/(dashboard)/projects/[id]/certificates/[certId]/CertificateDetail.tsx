'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { revokeCertificate } from '@/app/actions/certificates'

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
  canEdit: _canEdit,
  isAdmin,
}: {
  projectId: string
  projectName: string
  projectCode: string
  projectClient: string | null
  cert: CertFull
  exceptions: ExceptionRow[]
  itrs: ItrRow[]
  canEdit: boolean
  isAdmin: boolean
}) {
  const t      = useTranslations('Certificates')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [revokeError, setRevokeError]     = useState('')

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
      const result = await revokeCertificate({ certId: cert.id, projectId })
      if (result.error) {
        setRevokeError(result.error)
      } else {
        setRevokeConfirm(false)
        router.refresh()
      }
    })
  }

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
            <button
              className="no-print"
              onClick={() => window.print()}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)',
              }}
            >
              {t('detail.printBtn')}
            </button>
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
          {([
            t('detail.sigRoles.completion'),
            t('detail.sigRoles.client'),
            t('detail.sigRoles.authority'),
          ] as const).map(role => (
            <div key={role}>
              <div style={{ borderBottom: '1px solid #0f172a', marginBottom: '8px', height: '50px' }} />
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{role}</div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '3px' }}>{t('detail.sigName')}</div>
            </div>
          ))}
        </div>
      </div>

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
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: '1.5' }}
               dangerouslySetInnerHTML={{ __html: t('detail.revokeModal.body', { certNumber: `<strong>${cert.certificate_number}</strong>` }) }}
            />
            {revokeError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 14px' }}>{revokeError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRevokeConfirm(false)}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}
              >
                {t('detail.revokeModal.cancel')}
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'wait' : 'pointer' }}
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