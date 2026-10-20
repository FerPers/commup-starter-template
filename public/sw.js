// CommUp Service Worker — v2.1 (S18)
// Strategy:
//   /_next/static/*  → cache-first (immutable assets)
//   navigate (HTML)  → network-first, fallback to cache (commup-pages, últimas 40), fallback to /offline
//   images           → cache-first (same-origin)
//   API/Supabase     → NO se intercepta ni se cachea (S18, G-03): lo offline va por IndexedDB
//   scripts/estilos  → network-first (S18, G-20)
//   default          → stale-while-revalidate
// Plus: Push notifications.
//
// S18 (C-08/G-03/A-09): las páginas van en su propia caché (`commup-pages-*`) para que el cierre de sesión
// (src/lib/sync/session.ts → purgeSessionCaches) las borre junto con las imágenes. Al activar esta versión se
// borran las cachés viejas, incluida `commup-api-*` (respuestas REST/Auth de Supabase de versiones anteriores).

const SW_VERSION = '2.1.0'
const CACHE_STATIC = `commup-static-v${SW_VERSION}`
const CACHE_PAGES  = `commup-pages-v${SW_VERSION}`
const CACHE_IMAGES = `commup-images-v${SW_VERSION}`
const KEEP_CACHES  = [CACHE_STATIC, CACHE_PAGES, CACHE_IMAGES]
const OFFLINE_URL  = '/offline'
const MAX_PAGES    = 40

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

const API_PATTERNS = [
  /\/rest\/v1\//,
  /\/auth\/v1\//,
  /supabase\.co/,
]

// ── Install ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE).catch(err => console.warn('[SW] Precache failed:', err)))
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip Next.js internals that must always hit network
  if (url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc')) return

  // Cache-first for immutable Next.js static chunks
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC))
    return
  }

  // Network-first for navigation (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(navigateFirst(request))
    return
  }

  // Supabase / API: nunca se cachea (datos y tokens de la sesión).
  if (API_PATTERNS.some(p => p.test(request.url))) return

  // Images (solo del propio origen: las URLs firmadas de evidencias no se guardan)
  if (url.origin === self.location.origin && request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMAGES))
    return
  }

  // Same-origin scripts/styles/fonts
  if (
    url.origin === self.location.origin &&
    (request.destination === 'script' || request.destination === 'style' || request.destination === 'font')
  ) {
    event.respondWith(networkFirst(request, CACHE_STATIC))
    return
  }

  // Default: stale-while-revalidate for same-origin assets
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC))
  }
})

// ── Strategies ────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(cacheName).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    return new Response('Asset offline', { status: 503 })
  }
}

async function networkFirst(request, cacheName) {
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(cacheName).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    return cached ?? new Response('Asset offline', { status: 503 })
  }
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function navigateFirst(request) {
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(CACHE_PAGES).then(c => c.put(request, clone)).then(() => trimCache(CACHE_PAGES, MAX_PAGES))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline ?? new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request).then(resp => {
    if (resp.ok) cache.put(request, resp.clone())
    return resp
  }).catch(() => cached || new Response('Offline', { status: 503 }))
  return cached || fetchPromise
}

// ── Push Notifications ────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload = {}
  try { payload = event.data.json() } catch { payload = { title: 'CommUp', body: event.data.text() } }

  const title = payload.title || 'CommUp'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: payload.tag || 'commup-notification',
    renotify: true,
    requireInteraction: payload.priority === 'high',
    silent: payload.priority === 'low',
    data: {
      url: payload.action_url || '/',
      type: payload.type || 'SYSTEM',
      entity_id: payload.entity_id || null,
    },
    actions: buildActions(payload),
    vibrate: payload.priority === 'high' ? [200, 100, 200] : [100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}
  let target = data.url || '/'

  if (event.action === 'dismiss') return
  if (event.action === 'complete' && data.type === 'ITR' && data.entity_id) {
    target = `/itrs/${data.entity_id}/capture`
  }

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus()
        client.postMessage({ type: 'NAVIGATE', url: target })
        return
      }
    }
    return self.clients.openWindow(target)
  })())
})

function buildActions(payload) {
  switch (payload.type) {
    case 'ITR_RETURNED':
      return [
        { action: 'view', title: 'Ver ITR' },
        { action: 'dismiss', title: 'Cerrar' },
      ]
    case 'PUNCH_ASSIGNED':
    case 'PUNCH_CAT_A':
      return [
        { action: 'view', title: 'Ver Punch' },
        { action: 'complete', title: 'Completar' },
      ]
    case 'CERT_READY':
      return [{ action: 'view', title: 'Ver Certificado' }]
    default:
      return [{ action: 'view', title: 'Abrir' }]
  }
}

