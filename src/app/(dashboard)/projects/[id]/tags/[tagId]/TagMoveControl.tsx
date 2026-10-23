'use client'

import Link from 'next/link'
// C-16 (D9): mover un tag de subsistema con lo suyo. La BD calcula qué arrastra
// (tag_subsystem_move_preview) y la RPC mueve en una transacción: ITR sin firmar y punches abiertos.
// Un ITR firmado bloquea hasta reabrirlo. Líder+, con motivo (≥ 10).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { moveTagSubsystem, previewTagMove } from '@/app/actions/tags'
import { TAG_MOVE_REASON_MIN, type TagMovePreview } from '@/lib/tags/move'

export type SubsystemOption = { id: string; code: string; name: string; system_code: string }

const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
const warnBox: React.CSSProperties = { fontSize: '12px', padding: '8px 10px', borderRadius: '6px', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-800)', margin: '8px 0 0' }

export default function TagMoveControl({ projectId, tagId, currentSubsystemId, subsystems, onClose }: {
  projectId: string
  tagId: string
  currentSubsystemId: string
  subsystems: SubsystemOption[]
  onClose: () => void
}) {
  const t = useTranslations('TagMove')
  const router = useRouter()
  const [target, setTarget] = useState('')
  const [preview, setPreview] = useState<TagMovePreview | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const choose = (subsystemId: string) => {
    setTarget(subsystemId); setPreview(null); setError(null)
    if (!subsystemId) return
    startTransition(async () => {
      const res = await previewTagMove({ projectId, tagId, subsystemId })
      if (res.error) { setError(res.error); return }
      setPreview(res.preview ?? null)
    })
  }

  const blocked = !!preview && preview.signed_itrs.length > 0
  const ok = !!preview && !blocked && !preview.same && reason.trim().length >= TAG_MOVE_REASON_MIN

  const confirm = () => startTransition(async () => {
    setError(null)
    const res = await moveTagSubsystem({ projectId, tagId, subsystemId: target, reason: reason.trim() })
    if (res.error) { setError(res.error); return }
    setDone(t('done', { itrs: res.itrsMoved ?? 0, punches: res.punchesMoved ?? 0, to: preview?.to.subsystem_code ?? '' }))
    setPreview(null); setReason(''); setTarget('')
    router.refresh()
  })

  return (
    <div style={{ marginBottom: '20px', padding: '16px 18px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>{t('title')}</strong>
        <button onClick={onClose} style={{ ...btn, background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{t('close')}</button>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('intro')}</p>

      {done && <p role="status" style={{ fontSize: '12px', color: 'var(--success-800)', background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: '6px', padding: '8px 10px', margin: '0 0 12px' }}>{done}</p>}

      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('targetLabel')}</label>
      <select value={target} onChange={e => choose(e.target.value)} disabled={isPending}
        style={{ width: '100%', maxWidth: '420px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', background: 'var(--card-bg)', fontFamily: 'inherit' }}>
        <option value="">{t('targetPlaceholder')}</option>
        {subsystems.filter(s => s.id !== currentSubsystemId).map(s => (
          <option key={s.id} value={s.id}>{s.system_code} › {s.code}{s.name ? ` — ${s.name}` : ''}</option>
        ))}
      </select>

      {preview && (
        <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--text-strong)' }}>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {preview.from.system_code} › {preview.from.subsystem_code} → {preview.to.system_code} › {preview.to.subsystem_code}
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
            <li>{t('itrsMove', { count: preview.itrs.length })}</li>
            <li>{t('punchesMove', { count: preview.punches.length })}</li>
            {preview.punches_kept > 0 && <li style={{ color: 'var(--text-muted)' }}>{t('punchesKept', { count: preview.punches_kept })}</li>}
          </ul>

          {blocked && (
            <div role="alert" style={{ ...warnBox, background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-800)' }}>
              {t('blocked')}{' '}
              {preview.signed_itrs.map((i, n) => (
                <span key={i.id}>{n > 0 && ', '}<Link href={`/projects/${projectId}/tags/${tagId}/itrs/${i.id}`} style={{ color: 'var(--danger-800)', fontWeight: 600 }}>{i.itr_number}</Link></span>
              ))}
            </div>
          )}
          {preview.certificates.length > 0 && (
            <p style={warnBox}>{t('certificates', { list: preview.certificates.map(c => `${c.certificate_number} (${c.side === 'from' ? preview.from.subsystem_code : preview.to.subsystem_code})`).join(', ') })}</p>
          )}
          {(preview.from.boundary_frozen || preview.to.boundary_frozen) && <p style={warnBox}>{t('frozen')}</p>}

          {!blocked && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('reasonLabel')}</label>
              <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reasonPlaceholder')}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 8px' }}>{t('hint')}</p>
              <button disabled={!ok || isPending} onClick={confirm}
                style={{ ...btn, background: ok && !isPending ? 'var(--primary-500)' : 'var(--gray-100)', color: ok && !isPending ? '#fff' : 'var(--gray-400)', border: 'none', cursor: ok && !isPending ? 'pointer' : 'not-allowed' }}>
                {isPending ? t('moving') : t('confirm')}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" style={{ fontSize: '12px', color: 'var(--danger-700)', margin: '10px 0 0' }}>{error}</p>}
    </div>
  )
}
