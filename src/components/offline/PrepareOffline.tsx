'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/** = public/sw.js MAX_PREP. */
export const PREPARE_MAX = 30
const READY_EVENT = 'commup:offline-prepared'

/** ¿Esta página está guardada para abrirla sin red (preparada o visitada)? */
async function isCached(url: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const abs = new URL(url, location.origin).href
  return Boolean(await caches.match(abs))
}

/**
 * S18 sesión 2 (C-09, decisión de Luis 2026-10-20): descarga los ITR que tengo por ejecutar o revisar (hasta 30)
 * para abrirlos sin red. El SW guarda cada página y sus chunks (mensaje PRECACHE_PAGES); cada fila de Mi trabajo
 * muestra «Disponible sin red» con OfflineReadyChip.
 */
export default function PrepareOffline({ urls }: { urls: string[] }) {
  const t = useTranslations('OfflineSession')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'unsupported'>('idle')
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)
  const [online, setOnline] = useState(true)
  const list = urls.slice(0, PREPARE_MAX)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capacidad del navegador, solo se conoce tras hidratar
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') setState('unsupported')
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync) }
  }, [])

  if (list.length === 0 || state === 'unsupported') return null

  async function prepare() {
    setState('busy'); setResult(null)
    const reg = await navigator.serviceWorker.ready
    const sw = reg.active
    if (!sw) { setState('unsupported'); return }
    const channel = new MessageChannel()
    const done = new Promise<{ ok: number; failed: number }>(resolve => { channel.port1.onmessage = e => resolve(e.data) })
    sw.postMessage({ type: 'PRECACHE_PAGES', urls: list }, [channel.port2])
    const r = await done
    setResult(r); setState('done')
    window.dispatchEvent(new Event(READY_EVENT))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
      <div style={{ flex: 1, minWidth: 200, fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
        {state === 'done' && result
          ? t('prepared', { ok: result.ok, failed: result.failed })
          : t('prepareHint', { n: list.length })}
      </div>
      <button type="button" onClick={() => { void prepare() }} disabled={state === 'busy' || !online}
        style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--primary-500)', background: 'var(--primary-600)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        {state === 'busy' ? t('preparing') : t('prepare')}
      </button>
    </div>
  )
}

/** Chip «Disponible sin red» de una fila (página preparada o ya visitada en este dispositivo). */
export function OfflineReadyChip({ url }: { url: string }) {
  const t = useTranslations('OfflineSession')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const check = () => { isCached(url).then(v => { if (alive) setReady(v) }).catch(() => {}) }
    check()
    window.addEventListener(READY_EVENT, check)
    return () => { alive = false; window.removeEventListener(READY_EVENT, check) }
  }, [url])
  if (!ready) return null
  return (
    <span title={t('readyTitle')} style={{ fontSize: 12, fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--success-50)', color: 'var(--success-700)' }}>
      {t('ready')}
    </span>
  )
}
