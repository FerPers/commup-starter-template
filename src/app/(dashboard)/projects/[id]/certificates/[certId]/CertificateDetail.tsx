'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

// ── Config ─────────────────────────────────────────────────────────────────

const ITR_STATUS = {
  not_started: { label: 'Sin iniciar',  color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'En progreso',  color: '#3b82f6', bg: '#eff6ff' },
  completed:   { label: 'Completado',   color: '#10b981', bg: '#ecfdf5' },
  approved:    { label: 'Aprobado',     color: '#7c3aed', bg: '#f5f3ff' },
  rejected:    { label: 'Rechazado',    color: '#ef4444', bg: '#fee2e2' },
} as const

const CERT_STATUS = {
  pending:   { label: 'Pendiente',   color: '#64748b', bg: '#f1f5f9' },
  in_review: { label: 'En revisión', color: '#3b82f6', bg: '#eff6ff' },
  issued:    { label: 'Emitido',     color: '#10b981', bg: '#ecfdf5' },
  rejected:  { label: 'Revocado',    color: '#ef4444', bg: '#fee2e2' },
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
  canEdit: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [revokeError, setRevokeError] = useState('')

  const phase = cert.project_phases
  const subsystem = cert.subsystems
  const certSt = CERT_STATUS[cert.status] ?? CERT_STATUS.pending

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

  function handlePrint() {
    window.print()
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Print styles injected */}
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
          fontSize: '13px', color: '#64748b', textDecoration: 'none',
        }}>
          ← Certificados — {projectName}
        </a>
      </div>

      {/* Certificate Header (printable) */}
      <div className="print-card" style={{
        background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
        padding: '28px 32px', marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: phase ? `${phase.color}20` : '#f1f5f9',
              border: `2px solid ${phase?.color ?? '#e2e8f0'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: phase?.color ?? '#64748b',
            }}>
              {phase?.certificate_name ?? phase?.code ?? '—'}
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
                {cert.certificate_number}
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>{cert.title}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              padding: '5px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
              background: certSt.bg, color: certSt.color,
            }}>
              {certSt.label}
            </span>
            <button
              className="no-print"
              onClick={handlePrint}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer', border: '1px solid #e2e8f0', background: 'white', color: '#475569',
              }}
            >
              Imprimir / PDF
            </button>
            {isAdmin && cert.status === 'issued' && (
              <button
                className="no-print"
                onClick={() => setRevokeConfirm(true)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444',
                }}
              >
                Revocar
              </button>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
          {[
            { label: 'Proyecto', value: `${projectCode} — ${projectName}` },
            { label: 'Cliente', value: projectClient ?? '—' },
            { label: 'Sistema', value: subsystem?.systems ? `${subsystem.systems.code}` : '—' },
            { label: 'Subsistema', value: subsystem ? `${subsystem.code} — ${subsystem.name}` : '—' },
            { label: 'Fase', value: phase ? `${phase.code} — ${phase.name}` : '—' },
            { label: 'Fecha emisión', value: cert.issued_date ? new Date(cert.issued_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
            { label: 'Emitido por', value: cert.issued_by_profile?.full_name ?? '—' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '10px 0', paddingRight: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {cert.notes && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Notas</div>
            <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: '1.5' }}>{cert.notes}</p>
          </div>
        )}
      </div>

      {/* ITR Completion Table */}
      <div className="print-card print-page" style={{
        background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
        padding: '20px 24px', marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
            ITRs del Subsistema — Fase {phase?.certificate_name ?? phase?.code}
          </h3>
          <span style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: approvedItrs === itrs.length && itrs.length > 0 ? '#ecfdf5' : '#eff6ff',
            color: approvedItrs === itrs.length && itrs.length > 0 ? '#10b981' : '#3b82f6',
          }}>
            {approvedItrs} / {itrs.length} aprobados
          </span>
        </div>

        {itrs.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Sin ITRs registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['N° ITR', 'Tag', 'Template', 'Estado'].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itrs.map((itr, idx) => {
                const st = ITR_STATUS[itr.status as keyof typeof ITR_STATUS] ?? ITR_STATUS.not_started
                return (
                  <tr key={itr.id} style={{ borderBottom: idx < itrs.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: '#0f172a' }}>
                      {itr.itr_number}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#475569' }}>
                      {itr.tags?.tag_number ?? '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#64748b' }}>
                      {itr.itr_templates ? `${itr.itr_templates.code} — ${itr.itr_templates.title}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                        background: st.bg, color: st.color,
                      }}>
                        {st.label}
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
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          padding: '20px 24px', marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>
            Excepciones Punches Cat B
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
                  <strong>Justificación:</strong> {exc.justification}
                </p>
                <div style={{ fontSize: '11px', color: '#d97706' }}>
                  Aprobado por {exc.approved_by_profile?.full_name ?? '—'} ·{' '}
                  {new Date(exc.approved_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature area (printable) */}
      <div className="print-card print-page" style={{
        background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
        padding: '24px 32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 24px' }}>
          Firmas de aprobación
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>
          {['Responsable Completación', 'Representante Cliente', 'Autoridad'].map(role => (
            <div key={role}>
              <div style={{ borderBottom: '1px solid #0f172a', marginBottom: '8px', height: '50px' }} />
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{role}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>Nombre y firma</div>
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
            background: 'white', borderRadius: '14px', padding: '28px',
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
              ¿Revocar certificado?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.5' }}>
              El certificado <strong>{cert.certificate_number}</strong> quedará en estado Revocado.
              Esta acción es auditable.
            </p>
            {revokeError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 14px' }}>{revokeError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRevokeConfirm(false)}
                style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending}
                style={{ padding: '8px 18px', border: 'none', borderRadius: '8px', background: '#ef4444', color: 'white', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'wait' : 'pointer' }}
              >
                {isPending ? 'Revocando...' : 'Sí, revocar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
