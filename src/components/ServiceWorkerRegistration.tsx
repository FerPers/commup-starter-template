'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ServiceWorkerRegistration() {
  const router = useRouter()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // S18 (G-20): en desarrollo los chunks no son inmutables → el SW servía código viejo. Solo en producción;
    // en dev se desregistra el que hubiera quedado y se borran sus cachés.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .then(() => (typeof caches === 'undefined' ? [] : caches.keys()))
        .then(keys => Promise.all(keys.filter(k => k.startsWith('commup-')).map(k => caches.delete(k))))
        .catch(() => {})
      return
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => console.warn('SW registration failed:', err))

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null
      if (data?.type === 'NAVIGATE' && data.url) router.push(data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}
