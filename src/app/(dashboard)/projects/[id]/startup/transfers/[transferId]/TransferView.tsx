'use client'

import Link from 'next/link'
import { useAskDialog } from '@/components/ui/AskDialog'
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
  commissioning_ack: string[] | null; operations_ack: string[] | null
}
type Pkg = { id: string; version: string; status: string; generated_at: string | null; signature_hash: string | null; zip_path: string | null; omitted_count: number } | null

// A08: por firmar = espera a otra persona (violeta).
const TONE: Record<string, 'violet' | 'green' | 'struck'> = { pending_signatures: 'violet', completed: 'green', cancelled: 'struck' }

export default function TransferView({ project, transfer: tr, pkg, names, canSign, canEdit }: {
  project: { id: string; code: string; name: string }
  transfer: Transfer
  pkg: Pkg
  names: Record<string, string>
  canSign: ('commissioning' | 'operations')[]
  canEdit: boolean
}) {
  // A10: un paquete PARTIAL también se descarga (avisando lo omitido); FAILED/GENERATING/SUPERSEDED no.
  const downloadable = pkg?.status === 'ISSUED' || pkg?.status === 'PARTIAL'
  const t = useTranslations('Startup')
  // S25b (E-34): diálogos propios en vez de window.prompt / window.confirm.
  const { dialog, ask } = useAskDialog()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  // S25 (E-13): cada firmante reconoce, una por una, las excepciones justificadas.
  const [ack, setAck] = useState<Set<string>>(new Set())
  const allAcked = tr.exceptions.every(e => ack.has(e.key))
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
  function download(kind: 'pdf' | 'zip') {
    if (!pkg) return
    run(() => getSignedHandoverUrlsAction(pkg.id), res => {
      const url = kind === 'zip' ? res.zipUrl : res.pdfUrl
      if (url) window.open(url, '_blank', 'noopener')
    })
  }

  const signatures: { cap: 'commissioning' | 'operations'; by: string | null; at: string | null; ack: string[] | null }[] = [
    { cap: 'commissioning', by: tr.commissioning_signed_by, at: tr.commissioning_signed_at, ack: tr.commissioning_ack },
    { cap: 'operations', by: tr.operations_signed_by, at: tr.operations_signed_at, ack: tr.operations_ack },
  ]
  const mustAck = tr.status === 'pending_signatures' && tr.exceptions.length > 0 && signatures.some(s => !s.by && canSign.includes(s.cap))

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
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
        {mustAck && (
          <fieldset style={{ border: '1px solid var(--warning-200)', background: 'var(--warning-50)', borderRadius: 8, padding: '10px 12px', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ ...small, fontWeight: 700, color: 'var(--warning-700)', padding: '0 4px' }}>{t('ops.ackTitle')}</legend>
            {tr.exceptions.map(e => (
              <label key={e.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm)' }}>
                <input type="checkbox" checked={ack.has(e.key)} disabled={isPending} style={{ marginTop: 3 }}
                  onChange={ev => setAck(prev => { const n = new Set(prev); if (ev.target.checked) n.add(e.key); else n.delete(e.key); return n })} />
                <span><strong>{t(`ops.check.${e.key}`)}</strong> — {e.justification}</span>
              </label>
            ))}
          </fieldset>
        )}
        {signatures.map(s => (
          <div key={s.cap} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{t(`capacity.${s.cap}`)}</div>
              <div suppressHydrationWarning style={small}>{s.by ? `${who(s.by)} · ${when(s.at)}` : t('ops.awaitingSignature')}</div>
              {s.by && !!s.ack?.length && <div style={{ ...small, color: 'var(--warning-700)' }}>{t('ops.acked', { n: s.ack.length })}</div>}
            </div>
            {!s.by && canSign.includes(s.cap) && (
              <button type="button" style={btn('primary', isPending || !allAcked)} disabled={isPending || !allAcked} title={allAcked ? undefined : t('ops.ackFirst')}
                onClick={async () => { if ((await ask({ title: t('ops.sign'), message: t('ops.confirmSign', { capacity: t(`capacity.${s.cap}`) }), confirmLabel: t('ops.sign') })) !== null) run(
                  () => signOwnershipTransfer({ projectId: project.id, transferId: tr.id, capacity: s.cap, acknowledged: [...ack] }),
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
            {/* A10: un paquete con anexos omitidos se identifica antes de descargarlo. */}
            {pkg?.status === 'PARTIAL' && (
              <p role="status" style={{ ...small, margin: '4px 0 0', color: 'var(--warning-700)', fontWeight: 600 }}>{t('ops.handoverPartial', { n: pkg.omitted_count })}</p>
            )}
          </div>
          {pkg ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btn('outline', isPending || !downloadable)} disabled={isPending || !downloadable} onClick={() => download('pdf')}>{t('ops.downloadPdf')}</button>
              {pkg.zip_path && (
                <button type="button" style={btn('outline', isPending || !downloadable)} disabled={isPending || !downloadable} onClick={() => download('zip')}>{t('ops.downloadZip')}</button>
              )}
              {pkg.signature_hash && pkg.zip_path && (
                <a href={`/verify/${pkg.signature_hash}`} target="_blank" rel="noopener" style={{ ...small, alignSelf: 'center' }}>{t('ops.verifyHandover')}</a>
              )}
            </div>
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
