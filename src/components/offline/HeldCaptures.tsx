'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { claimLegacyEntries, OUTBOX_CHANGED_EVENT, pendingByOwner } from '@/lib/offline-queue'
import { replayQueueOnce } from '@/lib/sync/replay'
import { discardEntries, rememberDeviceUser } from '@/lib/sync/session'
import type { OwnerCounts } from '@/lib/sync/ownership'

/**
 * S18 (decisión de Luis 2026-10-20): capturas sin red que el usuario en sesión no puede enviar.
 *   - Sin autor (encoladas antes de S18): «Son mías — enviar» se las asigna; «Descartar» deja rastro.
 *   - De otra persona (entró sin que la anterior cerrara sesión): retenidas; solo se pueden descartar.
 * Al montar, si cambió el usuario del dispositivo se borran las páginas en caché del anterior.
 */
export default function HeldCaptures({ userId }: { userId: string }) {
  const t = useTranslations('OfflineSession')
  const [counts, setCounts] = useState<OwnerCounts>({ mine: 0, legacy: 0, other: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => { pendingByOwner(userId).then(setCounts).catch(() => {}) }, [userId])

  useEffect(() => {
    void rememberDeviceUser(userId)
    refresh()
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh)
  }, [userId, refresh])

  if (counts.legacy === 0 && counts.other === 0) return null

  async function claim() {
    setBusy(true); setError(null)
    await claimLegacyEntries(userId)
    if (navigator.onLine) await replayQueueOnce().catch(() => {})
    refresh(); setBusy(false)
  }

  async function discard() {
    if (!navigator.onLine) { setError(t('needsNetwork')); return }
    setBusy(true); setError(null)
    const res = await discardEntries(userId, { note: 'Captura retenida (sin autor o de otra persona) descartada' })
    if (res.error) setError(res.error)
    refresh(); setBusy(false)
  }

  return (
    <div role="status" style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13 }}>
      {counts.legacy > 0 && <div>{t('heldLegacy', { n: counts.legacy })}</div>}
      {counts.other > 0 && <div style={{ marginTop: counts.legacy > 0 ? 6 : 0 }}>{t('heldOther', { n: counts.other })}</div>}
      {error && <div role="alert" style={{ marginTop: 6, color: '#b91c1c' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {counts.legacy > 0 && (
          <button type="button" onClick={claim} disabled={busy} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {t('claim')}
          </button>
        )}
        <button type="button" onClick={discard} disabled={busy} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #fecaca', background: 'var(--card-bg)', color: '#b91c1c', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
          {t('discard')}
        </button>
      </div>
    </div>
  )
}
