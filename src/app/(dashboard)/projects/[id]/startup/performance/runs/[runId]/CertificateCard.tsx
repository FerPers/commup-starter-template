'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { issuePerformanceCertificate, revokePerformanceCertificate, signPerformanceCertificate } from '@/app/actions/performance'
import { CERT_TONE, canSignCertificate, isPerformanceLead, type CertCapacity, type CertificateStatus, type PerfResult } from '@/lib/performance/catalog'
import { Alert, Chip, btn, card, label, small } from '../../../../daily/daily-ui'

// Certificado PTC (fase 7, sesión 2b): quien emite firma como Comisionamiento; faltan Operaciones y Cliente
// (rol client), cada firma de una persona distinta. Las reglas viven en las RPC; aquí solo se muestran.

export type Certificate = {
  id: string; number: string; status: CertificateStatus; content_hash: string | null
  commissioning_signed_by: string | null; commissioning_signed_at: string | null
  operations_signed_by: string | null; operations_signed_at: string | null
  client_signed_by: string | null; client_signed_at: string | null
  revoked_by: string | null; revoked_at: string | null; revoke_reason: string | null
}

const sectionTitle: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }

export default function CertificateCard({ projectId, run, certificate, names, userId, role }: {
  projectId: string
  run: { id: string; status: string; result: PerfResult | null }
  certificate: Certificate | null
  names: Record<string, string>
  userId: string
  role: string
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const lead = isPerformanceLead(role)
  const certifiable = run.status === 'evaluated' && (run.result === 'accepted' || run.result === 'accepted_with_deviation')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')
  const pdfHref = `/projects/${projectId}/startup/performance/runs/${run.id}/pdf`

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  if (run.status !== 'evaluated') return null

  const slots: { cap: CertCapacity; by: string | null; at: string | null }[] = certificate ? [
    { cap: 'commissioning', by: certificate.commissioning_signed_by, at: certificate.commissioning_signed_at },
    { cap: 'operations', by: certificate.operations_signed_by, at: certificate.operations_signed_at },
    { cap: 'client', by: certificate.client_signed_by, at: certificate.client_signed_at },
  ] : []

  return (
    <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={sectionTitle}>{t('perf.cert.title')}</h2>
        <a href={pdfHref} target="_blank" rel="noreferrer" style={{ ...btn('outline'), textDecoration: 'none' }}>{t('perf.cert.pdf')}</a>
      </div>

      {!certificate && (
        certifiable
          ? (lead
              ? <div><button type="button" style={btn('primary', isPending)} disabled={isPending}
                  onClick={() => { if (window.confirm(t('perf.cert.issueConfirm'))) act(() => issuePerformanceCertificate({ projectId, runId: run.id })) }}>{t('perf.cert.issue')}</button></div>
              : <span style={small}>{t('perf.cert.leadIssues')}</span>)
          : <span style={small}>{t('perf.cert.notCertifiable')}</span>
      )}

      {certificate && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-strong)' }}>{certificate.number}</span>
            <Chip tone={CERT_TONE[certificate.status]}>{t(`perf.certStatus.${certificate.status}`)}</Chip>
            {certificate.content_hash && <span style={{ ...small, fontFamily: 'ui-monospace, monospace' }}>sha256 {certificate.content_hash.slice(0, 16)}…</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {slots.map(s => (
              <div key={s.cap} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: s.by ? 'var(--success-50)' : undefined }}>
                <div style={label}>{t(`perf.cert.cap.${s.cap}`)}</div>
                {s.by
                  ? <div style={{ ...small, marginTop: 4 }} suppressHydrationWarning>✓ {who(s.by)}<br />{when(s.at)}</div>
                  : s.cap !== 'commissioning' && canSignCertificate(certificate, s.cap, role, userId)
                    ? <button type="button" style={{ ...btn('primary', isPending), marginTop: 6 }} disabled={isPending}
                        onClick={() => { if (window.confirm(t('perf.cert.signConfirm'))) act(() => signPerformanceCertificate({ projectId, certificateId: certificate.id, capacity: s.cap as 'operations' | 'client' })) }}>
                        {t('perf.cert.sign')}
                      </button>
                    : <div style={{ ...small, marginTop: 4 }}>{certificate.status === 'pending_signatures' ? t(s.cap === 'client' ? 'perf.cert.waitClient' : 'perf.cert.waitOps') : '—'}</div>}
              </div>
            ))}
          </div>
          {certificate.status === 'revoked' && (
            <Alert kind="warn">{t('perf.cert.revoked', { who: who(certificate.revoked_by), when: when(certificate.revoked_at), reason: certificate.revoke_reason ?? '' })}</Alert>
          )}
          {lead && (certificate.status === 'pending_signatures' || certificate.status === 'accepted') && (
            <div>
              <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending}
                onClick={() => { const r = window.prompt(t('perf.cert.revokePrompt')); if (r?.trim()) act(() => revokePerformanceCertificate({ projectId, certificateId: certificate.id, reason: r.trim() })) }}>
                {t('perf.cert.revoke')}
              </button>
            </div>
          )}
        </>
      )}
      {error && <Alert kind="error">{error}</Alert>}
    </section>
  )
}
