'use client'

// S06 (C-11/A-06, D8): cancelar un punch deja de ser un clic. Lo hace un supervisor (leader+) distinto de
// quien lo levantó, con motivo (≥ 10); la RPC cancel_punch lo deja en los comentarios y en la auditoría.
// La BD decide; aquí solo se explica por qué no se puede y se pide el motivo.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { cancelPunch } from '@/app/actions/punches'
import { canSupervisePunch } from '@/lib/constants/punch-roles'

export default function CancelPunchControl({ punch, projectId, tagId, userId, role, onDone }: {
  punch: { id: string; raised_by: string | null; status: string }
  projectId: string
  tagId: string | null
  userId: string
  role: string
  onDone: () => void
}) {
  const t = useTranslations('PunchCancel')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (punch.status === 'closed' || punch.status === 'cancelled' || !canSupervisePunch(role)) return null
  if (punch.raised_by === userId) {
    return <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>{t('ownPunch')}</span>
  }

  const ok = reason.trim().length >= 10
  const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btn, background: 'var(--gray-50)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        {t('button')}
      </button>
    )
  }

  return (
    <div style={{ flexBasis: '100%', padding: '10px 12px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#7f1d1d', display: 'block', marginBottom: '6px' }}>{t('reasonLabel')}</label>
      <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reasonPlaceholder')}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
      <p style={{ fontSize: '11px', color: '#991b1b', margin: '4px 0 8px' }}>{t('hint')}</p>
      {error && <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '0 0 8px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button disabled={!ok || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            const res = await cancelPunch({ punchId: punch.id, projectId, tagId, reason: reason.trim() })
            if (res.error) { setError(res.error); return }
            setOpen(false); setReason(''); onDone()
          })}
          style={{ ...btn, background: ok && !isPending ? '#b91c1c' : '#fca5a5', color: '#fff', border: 'none', cursor: ok && !isPending ? 'pointer' : 'not-allowed' }}>
          {isPending ? t('cancelling') : t('confirm')}
        </button>
        <button onClick={() => { setOpen(false); setError(null) }} style={{ ...btn, background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{t('back')}</button>
      </div>
    </div>
  )
}
