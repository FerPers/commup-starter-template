// CommUp Service Worker — v2.0 (Stage 14)
// Strategy:
//   /_next/static/*  → cache-first (immutable assets)
//   navigate (HTML)  → network-first, fallback to cache, fallback to /offline
//   images           → cache-first
//   API/Supabase     → network-only with stale-cache fallback (5 min TTL)
//   default          → stale-while-revalidate
// Plus: Push notifications, Background Sync, Conflict log replay.

const SW_VERSION = '2.0.2'
const CACHE_STATIC = `commup-static-v${SW_VERSION}`
const CACHE_API    = `commup-api-v${SW_VERSION}`
const CACHE_IMAGES = `commup-images-v${SW_VERSION}`
const KEEP_CACHES  = [CACHE_STATIC, CACHE_API, CACHE_IMAGES]
const OFFLINE_URL  = '/offline'

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
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
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

  // Supabase / external API → network-only with stale fallback
  if (API_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(networkWithStaleFallback(request))
    return
  }

  // Images
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMAGES))
    return
  }

  // Same-origin scripts/styles/fonts
  if (
    url.origin === self.location.origin &&
    (request.destination === 'script' || request.destination === 'style' || request.destination === 'font')
  ) {
    event.respondWith(cacheFirst(request, CACHE_STATIC))
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

async function navigateFirst(request) {
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(CACHE_STATIC).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline ?? new Response('Offline', { status: 503 })
  }
}

async function networkWithStaleFallback(request) {
  try {
    const resp = await fetch(request)
    if (resp.ok && request.method === 'GET') {
      const headers = new Headers(resp.headers)
      headers.set('sw-cached-at', String(Date.now()))
      const clone = new Response(resp.clone().body, { status: resp.status, headers })
      caches.open(CACHE_API).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    if (cached) {
      const cachedAt = cached.headers.get('sw-cached-at')
      if (cachedAt && Date.now() - Number(cachedAt) < 5 * 60 * 1000) return cached
    }
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
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

// ── Background Sync ───────────────────────────────────────────────────
const SYNC_RESPONSES = 'commup-itr-responses-sync'

self.addEventListener('sync', event => {
  if (event.tag === SYNC_RESPONSES) {
    event.waitUntil(replayResponseQueue())
  }
})

async function replayResponseQueue() {
  // Notify clients to drain their offline-queue (they own Supabase auth cookies)
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  clients.forEach(c => c.postMessage({ type: 'SYNC_REPLAY', tag: SYNC_RESPONSES }))
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

