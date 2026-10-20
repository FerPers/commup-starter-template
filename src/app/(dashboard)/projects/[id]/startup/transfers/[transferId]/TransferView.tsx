'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cancelOwnershipTransfer, generateTransferHandover, signOwnershipTransfer } from '@/app/actions/ops-readiness'
import { getSignedHandoverUrlsAction } from '@/app/actions/handover'
import type { OwnershipStage } from '@/lib/startup/catalog'
import { Alert, Chip, Field, btn, card, input, linkStyle, small } from '../../../daily/daily-ui'
import { Checklist, StageChip, type CheckItem } from '../../operations/ownership-ui'
import { useLocalTime } from '@/lib/use-local-time'

type Transfer = {
  id: string; number: string; system: string; from_stage: OwnershipStage; to_stage: OwnershipStage; is_reversal: boolean; reason: string | null; status: string
  checklist: CheckItem[]; exceptions: { key: string; justification: string }[]
  requested_by: string | null; requested_at: string
  commissioning_signed_by: string | null; commissioning_signed_at: string | null; operations_signed_by: string | null; operations_signed_at: string | null
  completed_at: string | null; cancelled_by: string | null; cancelled_at: string | null; cancel_reason: string | null
  handover_package_id: string | null; content_hash: string | null
}
type Pkg = { id: string; version: string; status: string; generated_at: string | null; signature_hash: string | null } | null

const TONE: Record<string, 'amber' | 'green' | 'struck'> = { pending_signatures: 'amber', completed: 'green', cancelled: 'struck' }

export default function TransferView({ project, transfer: tr, pkg, names, canSign, canEdit }: {
  project: { id: string; code: string; name: string }
  transfer: Transfer
  pkg: Pkg
  names: Record<string, string>
  canSign: ('commissioning' | 'operations')[]
  canEdit: boolean
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const toOps = tr.to_stage === 'operations' && !tr.is_reversal

  function run<T extends { error?: string }>(fn: () => Promise<T>, after?: (res: T) => void) {
    setError(null); setWarn(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.(res)
      router.refresh()
    })
  }
  function download() {
    if (!pkg) return
    run(() => getSignedHandoverUrlsAction(pkg.id), res => { if (res.pdfUrl) window.open(res.pdfUrl, '_blank', 'noopener') })
  }

  const signatures: { cap: 'commissioning' | 'operations'; by: string | null; at: string | null }[] = [
    { cap: 'commissioning', by: tr.commissioning_signed_by, at: tr.commissioning_signed_at },
    { cap: 'operations', by: tr.operations_signed_by, at: tr.operations_signed_at },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/startup/operations`} style={linkStyle}>← {t('tab.operations')} · {project.code}</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{tr.number} · {tr.system}</h1>
          <Chip tone={TONE[tr.status] ?? 'muted'}>{t(`ops.status.${tr.status}`)}</Chip>
          {tr.is_reversal && <Chip tone="red">{t('ops.reversal')}</Chip>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <StageChip stage={tr.from_stage} /> <span aria-hidden>→</span> <StageChip stage={tr.to_stage} />
        </div>
        <p suppressHydrationWarning style={{ ...small, margin: '6px 0 0' }}>{t('ops.requestedBy', { name: who(tr.requested_by), date: when(tr.requested_at) })}</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {warn && <Alert kind="warn">{warn}</Alert>}
      {tr.status === 'cancelled' && <Alert kind="warn"><span suppressHydrationWarning>{t('ops.cancelledBy', { name: who(tr.cancelled_by), date: when(tr.cancelled_at), reason: tr.cancel_reason ?? '' })}</span></Alert>}

      {tr.reason && (
        <section style={card}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>{tr.is_reversal ? t('ops.reversalReason') : t('ops.reason')}</h2>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{tr.reason}</p>
        </section>
      )}

      {!tr.is_reversal && (
        <section style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('ops.checklistAtRequest')}</h2>
          <Checklist items={tr.checklist} exceptions={tr.exceptions} />
        </section>
      )}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('ops.signatures')}</h2>
        {signatures.map(s => (
          <div key={s.cap} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{t(`capacity.${s.cap}`)}</div>
              <div suppressHydrationWarning style={small}>{s.by ? `${who(s.by)} · ${when(s.at)}` : t('ops.awaitingSignature')}</div>
            </div>
            {!s.by && canSign.includes(s.cap) && (
              <button type="button" style={btn('primary', isPending)} disabled={isPending}
                onClick={() => { if (confirm(t('ops.confirmSign', { capacity: t(`capacity.${s.cap}`) }))) run(
                  () => signOwnershipTransfer({ projectId: project.id, transferId: tr.id, capacity: s.cap }),
                  res => { if (res.handoverError) setWarn(t('ops.handoverFailed', { error: res.handoverError })) },
                ) }}>{t('ops.sign')}</button>
            )}
          </div>
        ))}
        {tr.content_hash && <p style={{ ...small, margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>SHA-256 {tr.content_hash}</p>}
      </section>

      {tr.status === 'completed' && toOps && (
        <section style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>{t('ops.handover')}</h2>
            <p suppressHydrationWarning style={{ ...small, margin: '4px 0 0' }}>
              {pkg ? t('ops.handoverReady', { version: pkg.version, status: pkg.status, date: when(pkg.generated_at) }) : t('ops.handoverMissing')}
            </p>
          </div>
          {pkg ? (
            <button type="button" style={btn('outline', isPending || pkg.status !== 'ISSUED')} disabled={isPending || pkg.status !== 'ISSUED'} onClick={download}>{t('ops.downloadPdf')}</button>
          ) : canEdit && (
            <button type="button" style={btn('primary', isPending)} disabled={isPending}
              onClick={() => run(() => generateTransferHandover({ projectId: project.id, transferId: tr.id }))}>{isPending ? t('ops.generating') : t('ops.generateHandover')}</button>
          )}
        </section>
      )}

      {tr.status === 'pending_signatures' && canEdit && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!cancelling ? (
            <div><button type="button" style={btn('outline')} onClick={() => setCancelling(true)}>{t('ops.cancel')}</button></div>
          ) : (
            <>
              <Field text={t('ops.cancelReason')} wide required><textarea rows={2} style={input} value={reason} onChange={e => setReason(e.target.value)} /></Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn('danger', isPending || reason.trim().length < 3)} disabled={isPending || reason.trim().length < 3}
                  onClick={() => run(() => cancelOwnershipTransfer({ projectId: project.id, transferId: tr.id, reason: reason.trim() }), () => setCancelling(false))}>{t('ops.confirmCancel')}</button>
                <button type="button" style={btn('outline')} onClick={() => setCancelling(false)}>{t('ops.close')}</button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
