'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ServiceWorkerRegistration() {
  const router = useRouter()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => console.warn('SW registration failed:', err))

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string; tag?: string } | null
      if (!data) return
      if (data.type === 'NAVIGATE' && data.url) {
        router.push(data.url)
      }
      if (data.type === 'SYNC_REPLAY') {
        // Lazy-import to avoid pulling IDB into initial bundle
        import('@/lib/sync/replay').then(m => m.replayQueueOnce()).catch(() => {})
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}