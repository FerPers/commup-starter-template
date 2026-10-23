'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAskDialog } from '@/components/ui/AskDialog'
import { currentUserId as sessionUserId } from '@/lib/sync/owner'
import { sendableBy } from '@/lib/sync/ownership'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { getStartupOutbox, OUTBOX_CHANGED_EVENT, STARTUP_SYNC_ISSUE_EVENT, SYNC_DONE_EVENT } from '@/lib/offline-queue'
import { discardStartupEntry, retryStartupEntry, sendOrQueueStartup } from '@/lib/sync/startup-outbox'
import { inScope, isHeld, type StartupEntry, type StartupOp } from '@/lib/sync/startup-outbox-utils'
import { btn, card, small } from '../daily/daily-ui'

// Offline de arranque (fase 6; decisiones offline de Luis 2026-10-16): bandeja local de una ejecución o una hoja de line-up, aviso de
// red/pendientes (fijo arriba en móvil) y bandeja «No sincronizado» con reintentar / aplicar / descartar.

export function useStartupOutbox(kind: 'run' | 'sheet', id: string) {
  const router = useRouter()
  const { isOffline: browserOffline, sync, syncing } = useOfflineSync()
  const [netFailed, setNetFailed] = useState(false)
  const [entries, setEntries] = useState<StartupEntry[]>([])

  useEffect(() => {
    let alive = true
    const scope = kind === 'run' ? { runId: id } : { sheetId: id }
    const refresh = () => {
      Promise.all([getStartupOutbox(), sessionUserId()])
        // S18: solo las capturas de quien está en sesión.
        .then(([all, uid]) => { if (alive) setEntries(sendableBy(all, uid).filter(e => inScope(e, scope)).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) })
        .catch(() => {})
    }
    const onDone = () => { setNetFailed(false); router.refresh() }
    refresh()
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh)
    window.addEventListener(SYNC_DONE_EVENT, onDone)
    // Un rechazo también significa que el servidor cambió (p. ej. alguien detuvo la ejecución): traer su estado.
    window.addEventListener(STARTUP_SYNC_ISSUE_EVENT, onDone)
    return () => {
      window.removeEventListener(STARTUP_SYNC_ISSUE_EVENT, onDone)
      alive = false
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh)
      window.removeEventListener(SYNC_DONE_EVENT, onDone)
    }
  }, [kind, id, router])

  // Al abrir la página con capturas pendientes y red: sincronizar.
  const hasPending = entries.some(e => e.state === 'pending')
  useEffect(() => {
    if (hasPending && navigator.onLine) void sync()
  }, [hasPending, sync])

  /** Registra en línea o encola. mustQueue = hay capturas anteriores en este ámbito (no adelantarlas). */
  const capture = useCallback(async (op: StartupOp, send: () => Promise<{ error?: string }>, mustQueue: boolean) => {
    const res = await sendOrQueueStartup(op, send, { mustQueue })
    if ('error' in res) return res
    if (res.queued) {
      if (navigator.onLine && !mustQueue) setNetFailed(true)   // red cautiva: el navegador dice «en línea» pero falló
      else if (navigator.onLine) void sync()
    } else {
      router.refresh()
    }
    return res
  }, [router, sync])

  /** Por enviar (sin contar lo que está en la bandeja «No sincronizado» ni lo retenido detrás). */
  const sendable = entries.filter(e => e.state === 'pending' && !isHeld(e, entries)).length
  return { entries, sendable, isOffline: browserOffline || netFailed, syncing, sync, capture }
}

export function SyncBanner({ isOffline, count, syncing, onSync }: { isOffline: boolean; count: number; syncing: boolean; onSync: () => void }) {
  const t = useTranslations('Startup.offline')
  if (!isOffline && count === 0) return null
  return (
    <div role="status" style={{
      position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      padding: '10px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600,
      background: isOffline ? 'var(--gray-800)' : 'var(--primary-50)', color: isOffline ? 'var(--sidebar-text-strong)' : 'var(--primary-700)', border: isOffline ? 'none' : '1px solid var(--primary-300)',
    }}>
      <span style={{ flex: 1, minWidth: 180 }}>
        {isOffline ? `📴 ${t('offline')}` : '⏳'} {count > 0 && t('pending', { n: count })}
      </span>
      {!isOffline && count > 0 && (
        <button type="button" style={{ ...btn('outline', syncing), padding: '6px 12px' }} disabled={syncing} onClick={onSync}>
          {syncing ? t('syncing') : t('syncNow')}
        </button>
      )}
    </div>
  )
}

/** Bandeja «No sincronizado»: rechazos, conflictos de line-up y capturas retenidas detrás de un rechazo. */
export function SyncTray({ entries, isOffline, describe, conflictDetail, onChanged }: {
  entries: StartupEntry[]
  isOffline: boolean
  describe: (e: StartupEntry) => string
  conflictDetail?: (e: StartupEntry) => React.ReactNode
  onChanged: () => void
}) {
  const t = useTranslations('Startup.offline')
  // S25b (E-34): diálogos propios en vez de window.prompt / window.confirm.
  const { dialog, ask } = useAskDialog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issues = entries.filter(e => e.state !== 'pending' || isHeld(e, entries))
  if (issues.length === 0) return null
  const when = (iso: string) => new Date(iso).toLocaleString()

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if (res && res.error) setError(res.error)
      else onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ ...card, borderColor: 'var(--danger-200)', background: 'var(--danger-50)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {dialog}
      <strong style={{ color: 'var(--danger-700)' }}>⚠ {t('trayTitle', { n: issues.length })}</strong>
      <span style={small}>{t('trayHelp')}</span>
      {error && <span style={{ ...small, color: 'var(--danger-700)' }}>{error}</span>}
      {issues.map(e => {
        const held = e.state === 'pending'
        return (
          <div key={e.id} style={{ borderTop: '1px solid var(--danger-200)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{describe(e)}</div>
            <span style={{ ...small, fontSize: 'var(--text-xs)' }} suppressHydrationWarning>{t('captured', { when: when(e.capturedAt) })}</span>
            {held
              ? <span style={small}>{t('held')}</span>
              : e.state === 'conflict'
                ? <>{conflictDetail?.(e)}<span style={small}>{t('conflictHelp')}</span></>
                : <span style={{ ...small, color: 'var(--danger-700)' }}>{t('reason', { error: e.error ?? '' })}</span>}
            {!held && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...btn('primary', busy || isOffline), padding: '8px 12px' }} disabled={busy || isOffline}
                  onClick={() => run(() => retryStartupEntry(e))}>{e.state === 'conflict' ? t('applyMine') : t('retry')}</button>
                <button type="button" style={{ ...btn('outline', busy || isOffline), padding: '8px 12px', color: 'var(--danger-700)' }} disabled={busy || isOffline}
                  onClick={async () => { if ((await ask({ title: t('discard'), message: t('discardConfirm'), confirmLabel: t('discard'), danger: true })) !== null) void run(() => discardStartupEntry(e)) }}>{t('discard')}</button>
              </div>
            )}
          </div>
        )
      })}
      {isOffline && <span style={small}>{t('needsNetwork')}</span>}
    </section>
  )
}
