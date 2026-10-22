'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

/** N0 (H-05/G-04): error inesperado dentro del shell, con reintento y salida a Mi trabajo. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')
  useEffect(() => { console.error('[dashboard]', error) }, [error])
  return (
    <div style={{ padding: '48px 16px', maxWidth: 560, margin: '0 auto' }}>
      <div role="alert" style={{ background: 'var(--surface, #fff)', border: '1px solid #fecaca', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }}>{t('errorTitle')}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{t('errorBody')}</p>
        {error.digest && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace' }}>{t('errorRef', { ref: error.digest })}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--primary-600, #4f46e5)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>{t('retry')}</button>
          <Link href="/home" style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-strong)', fontWeight: 600, textDecoration: 'none' }}>{t('goMyWork')}</Link>
        </div>
      </div>
    </div>
  )
}
