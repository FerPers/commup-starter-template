'use client'

// S05 (C-23): el supervisor o el cliente asignado devuelve el ITR al ejecutor con observaciones (sin pasar
// por un administrador). Se retiran las firmas y el ejecutor recibe el aviso.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { returnItrToExecutor } from '@/app/actions/itr-instances'

export default function ReturnToExecutor({ itrId, projectId, tagId }: { itrId: string; projectId: string; tagId: string | null }) {
  const t = useTranslations('ItrExecution.returnToExecutor')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ok = reason.trim().length >= 10

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ padding: '7px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', cursor: 'pointer' }}>
        ↩ {t('button')}
      </button>
    )
  }
  return (
    <div style={{ marginTop: '10px', padding: '10px 12px', border: '1px solid #fde68a', borderRadius: '8px', background: '#fffbeb' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', display: 'block', marginBottom: '6px' }}>{t('reasonLabel')}</label>
      <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reasonPlaceholder')}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
      <p style={{ fontSize: '11px', color: '#92400e', margin: '4px 0 8px' }}>{t('hint')}</p>
      {error && <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '0 0 8px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button disabled={!ok || isPending} onClick={() => startTransition(async () => {
          setError(null)
          const res = await returnItrToExecutor({ itrId, projectId, tagId, reason: reason.trim() })
          if (res.error) { setError(res.error); return }
          setOpen(false); setReason(''); router.refresh()
        })} style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: 'none', background: ok && !isPending ? '#b45309' : '#fcd34d', color: '#fff', cursor: ok && !isPending ? 'pointer' : 'not-allowed' }}>
          {isPending ? t('sending') : t('confirm')}
        </button>
        <button onClick={() => { setOpen(false); setError(null) }} style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('back')}</button>
      </div>
    </div>
  )
}
