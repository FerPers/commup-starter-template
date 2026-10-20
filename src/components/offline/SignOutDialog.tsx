'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { countPending } from '@/lib/offline-queue'
import { replayQueueOnce } from '@/lib/sync/replay'
import { currentUserId } from '@/lib/sync/owner'
import { discardEntries } from '@/lib/sync/session'

/**
 * S18 (C-08/A-09, decisión de Luis 2026-10-20): cerrar sesión con capturas sin red pendientes obliga a
 * «sincronizar o descartar». Después, quien llama (UserMenu) cierra la sesión y vacía el dispositivo.
 */
export default function SignOutDialog({ pending, onCancel, onDone }: {
  pending: number
  onCancel: () => void
  /** Bandejas resueltas: cerrar sesión y limpiar. */
  onDone: () => void
}) {
  const t = useTranslations('OfflineSession')
  const [left, setLeft] = useState(pending)
  const [busy, setBusy] = useState<'sync' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)
  const online = typeof navigator === 'undefined' || navigator.onLine

  async function sync() {
    setBusy('sync'); setError(null)
    try {
      await replayQueueOnce()
      const n = await countPending()
      setLeft(n); setSynced(true)
      if (n === 0) { onDone(); return }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  async function discard() {
    setBusy('discard'); setError(null)
    // Con red queda constancia en sync_conflicts; sin red se borran igual (el diálogo lo advierte).
    if (navigator.onLine) {
      const res = await discardEntries(await currentUserId(), { includeMine: true, note: 'Descartado al cerrar sesión' })
      if (res.error) { setError(res.error); setBusy(null); return }
    }
    onDone()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signout-title" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', maxWidth: 440, width: '100%', padding: '20px 22px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <h2 id="signout-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
          {t('signOutTitle', { n: left })}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
          {synced ? t('stillPending', { n: left }) : t('signOutBody')}
        </p>
        {!online && <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>{t('offlineNote')}</p>}
        {error && <p role="alert" style={{ fontSize: 12, color: '#b91c1c', margin: '8px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onCancel} disabled={busy !== null} style={btn('ghost')}>{t('cancel')}</button>
          <button type="button" onClick={discard} disabled={busy !== null} style={btn('danger')}>
            {busy === 'discard' ? t('working') : t('discardAndExit')}
          </button>
          {online && (
            <button type="button" onClick={sync} disabled={busy !== null} style={btn('primary')}>
              {busy === 'sync' ? t('working') : t('syncAndExit')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function btn(kind: 'primary' | 'danger' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  if (kind === 'primary') return { ...base, background: '#2563eb', color: '#fff', border: '1px solid #2563eb' }
  if (kind === 'danger') return { ...base, background: 'var(--card-bg)', color: '#b91c1c', border: '1px solid #fecaca' }
  return { ...base, background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
}
